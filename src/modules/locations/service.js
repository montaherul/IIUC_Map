'use strict';
const { get, run, all } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');
const { validateLatitude, validateLongitude, validateAccuracy, validateAudience, parseFutureExpiry, SHARE_AUDIENCES } = require('../../utils/validation');

const STALE_AFTER_MS = 2 * 60 * 1000;
const LEGACY_AUDIENCE = { all_authenticated: 'campus', students: 'campus' };

function normalizeAudience(v) {
  const a = validateAudience(v, { allowNone: true, required: false });
  if (!a) return null;
  return LEGACY_AUDIENCE[a] || a;
}

function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && ms <= now;
}

function isStale(recordedAt, now = Date.now()) {
  const ms = Date.parse(recordedAt);
  return !Number.isFinite(ms) || now - ms > STALE_AFTER_MS;
}

async function cleanupStale(now = nowIso()) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  await run('DELETE FROM live_locations WHERE expires_at IS NOT NULL AND expires_at <= ?', [now]);
  await run('DELETE FROM live_locations WHERE recorded_at <= ?', [cutoff]);
  await run(
    `UPDATE sharing_preferences SET is_sharing = 0, audience = 'none', expires_at = NULL, updated_at = ?
     WHERE is_sharing = 1 AND expires_at IS NOT NULL AND expires_at <= ?`,
    [now, now]
  );
}

async function getPrefs(userId) {
  await cleanupStale();
  return get('SELECT * FROM sharing_preferences WHERE user_id = ?', [userId]);
}

async function setPrefs(userId, { isSharing, audience, expiresAt, durationMinutes } = {}) {
  const sharing = !!isSharing;
  const existing = await get('SELECT * FROM sharing_preferences WHERE user_id = ?', [userId]);
  let nextAudience = 'none';
  let nextExpiry = null;
  if (sharing) {
    const requested = normalizeAudience(audience != null ? audience : (existing && existing.audience !== 'none' ? existing.audience : 'campus'));
    if (!requested || requested === 'none' || !SHARE_AUDIENCES.has(requested)) {
      throw Object.assign(new Error('Select a valid sharing audience'), { status: 400, code: 'VALIDATION' });
    }
    nextAudience = requested;
    nextExpiry = parseFutureExpiry({ expiresAt, durationMinutes }, { required: false, maxDays: 1 }) || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  }
  const now = nowIso();
  await run(
    `INSERT INTO sharing_preferences(user_id, is_sharing, audience, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
     is_sharing=excluded.is_sharing, audience=excluded.audience, expires_at=excluded.expires_at, updated_at=excluded.updated_at`,
    [userId, sharing ? 1 : 0, nextAudience, nextExpiry, now]
  );
  if (!sharing) await run('DELETE FROM live_locations WHERE user_id = ?', [userId]);
  return get('SELECT * FROM sharing_preferences WHERE user_id = ?', [userId]);
}

async function upsertLive(userId, { latitude, longitude, accuracy } = {}) {
  const lat = validateLatitude(latitude);
  const lng = validateLongitude(longitude);
  const acc = validateAccuracy(accuracy);
  const prefs = await get('SELECT * FROM sharing_preferences WHERE user_id = ?', [userId]);
  if (!prefs || !prefs.is_sharing) throw Object.assign(new Error('Sharing not enabled'), { status: 403, code: 'NOT_SHARING' });
  if (isExpired(prefs.expires_at)) {
    await setPrefs(userId, { isSharing: false, audience: 'none', expiresAt: null });
    throw Object.assign(new Error('Sharing expired'), { status: 403, code: 'EXPIRED' });
  }
  const now = nowIso(); // server-generated timestamp
  await run(
    `INSERT INTO live_locations(user_id, latitude, longitude, accuracy, recorded_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
     latitude=excluded.latitude, longitude=excluded.longitude, accuracy=excluded.accuracy, recorded_at=excluded.recorded_at, expires_at=excluded.expires_at`,
    [userId, lat, lng, acc, now, prefs.expires_at || null]
  );
  return get('SELECT * FROM live_locations WHERE user_id = ?', [userId]);
}

async function stop(userId) { return setPrefs(userId, { isSharing: false, audience: 'none', expiresAt: null }); }

function canView(viewer, _sharerRole, audience) {
  if (!viewer) return false;
  const a = LEGACY_AUDIENCE[audience] || audience;
  if (viewer.role === 'admin') return a === 'campus' || a === 'teachers' || a === 'selected';
  if (a === 'campus') return ['student', 'teacher', 'admin'].includes(viewer.role);
  if (a === 'teachers') return ['teacher', 'admin'].includes(viewer.role);
  if (a === 'selected') return false; // selected-audience ACL not implemented in baseline; deny by default
  return false;
}

async function listVisible(viewer) {
  await cleanupStale();
  const rows = await all(
    `SELECT l.*, u.display_name, r.name AS role, p.audience, p.expires_at AS pref_expires_at
     FROM live_locations l
     JOIN users u ON u.id = l.user_id
     JOIN roles r ON r.id = u.role_id
     JOIN sharing_preferences p ON p.user_id = l.user_id
     WHERE p.is_sharing = 1 AND u.is_active = 1`
  );
  const now = Date.now();
  return rows.filter((r) => {
    const exp = r.pref_expires_at || r.expires_at;
    return !isExpired(exp, now) && !isStale(r.recorded_at, now) && canView(viewer, r.role, r.audience);
  }).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
    audience: LEGACY_AUDIENCE[r.audience] || r.audience,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracy: r.accuracy,
    recordedAt: r.recorded_at,
    expiresAt: r.pref_expires_at || r.expires_at || null,
  }));
}

async function getStatus(userId) {
  const prefs = await getPrefs(userId);
  const location = await get('SELECT * FROM live_locations WHERE user_id = ?', [userId]);
  return { prefs, location: location && !isStale(location.recorded_at) ? location : null, staleAfterMs: STALE_AFTER_MS };
}

module.exports = { getPrefs, setPrefs, upsertLive, stop, listVisible, canView, getStatus, cleanupStale, STALE_AFTER_MS };
