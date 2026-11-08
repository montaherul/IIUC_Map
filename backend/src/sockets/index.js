'use strict';
let _db;
function db() { if (!_db) _db = require('../config/db').db; return _db; }

const { validateLatitude, validateLongitude, validateAccuracy, validateId, assertAuthenticated } = require('../utils/validation');

function roomFor(audience) { return `aud:${audience}`; }
function markerRoom(markerId) { return `marker:${Number(markerId)}`; }
function nowIso() { return new Date().toISOString(); }

function getUser(userId) {
  return db().prepare(
    `SELECT u.id, u.email, u.display_name, u.is_active, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
  ).get(userId);
}
function getPrefs(userId) { return db().prepare('SELECT * FROM sharing_preferences WHERE user_id = ?').get(userId); }
function getLiveLocation(userId) { return db().prepare('SELECT * FROM live_locations WHERE user_id = ?').get(userId); }
function getMarker(id) { return db().prepare('SELECT * FROM markers WHERE id = ? AND is_active = 1').get(id); }

function canView(viewer, _sharerRole, audience) {
  if (!viewer) return false;
  const a = audience === 'all_authenticated' || audience === 'students' ? 'campus' : audience;
  if (viewer.role === 'admin') return a === 'campus' || a === 'teachers' || a === 'selected';
  if (a === 'campus') return ['student', 'teacher', 'admin'].includes(viewer.role);
  if (a === 'teachers') return ['teacher', 'admin'].includes(viewer.role);
  if (a === 'selected') return false;
  return false;
}

function listVisible(viewer) {
  const rows = db().prepare(
    `SELECT l.*, u.display_name, r.name AS role, p.audience FROM live_locations l
     JOIN users u ON u.id = l.user_id
     JOIN roles r ON r.id = u.role_id
     JOIN sharing_preferences p ON p.user_id = l.user_id
     WHERE p.is_sharing = 1 AND u.is_active = 1`
  ).all();
  const now = Date.now();
  return rows
    .filter((r) => (!r.expires_at || Date.parse(r.expires_at) > now) && canView(viewer, r.role, r.audience))
    .map((r) => ({ userId: r.user_id, displayName: r.display_name, role: r.role, latitude: r.latitude, longitude: r.longitude, accuracy: r.accuracy, recordedAt: r.recorded_at }));
}

function upsertLive(userId, { latitude, longitude, accuracy } = {}) {
  const lat = validateLatitude(latitude); const lng = validateLongitude(longitude); const acc = validateAccuracy(accuracy);
  const prefs = getPrefs(userId);
  if (!prefs || !prefs.is_sharing) throw Object.assign(new Error('Sharing not enabled'), { status: 403, code: 'NOT_SHARING' });
  if (prefs.expires_at && Date.parse(prefs.expires_at) < Date.now()) {
    db().prepare(`UPDATE sharing_preferences SET is_sharing = 0, audience = 'none', expires_at = NULL, updated_at = ? WHERE user_id = ?`).run(nowIso(), userId);
    db().prepare('DELETE FROM live_locations WHERE user_id = ?').run(userId);
    throw Object.assign(new Error('Sharing expired'), { status: 403, code: 'EXPIRED' });
  }
  const now = nowIso();
  db().prepare(
    `INSERT INTO live_locations(user_id, latitude, longitude, accuracy, recorded_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
     latitude=excluded.latitude, longitude=excluded.longitude, accuracy=excluded.accuracy,
     recorded_at=excluded.recorded_at, expires_at=excluded.expires_at`
  ).run(userId, lat, lng, acc, now, prefs.expires_at || null);
  return getLiveLocation(userId);
}

function stopSharing(userId) {
  db().prepare(`UPDATE sharing_preferences SET is_sharing = 0, audience = 'none', expires_at = NULL, updated_at = ? WHERE user_id = ?`).run(nowIso(), userId);
  db().prepare('DELETE FROM live_locations WHERE user_id = ?').run(userId);
}

function registerSockets(io, sessionMiddleware) {
  io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
  io.use((socket, next) => {
    const user = socket.request.session && socket.request.session.user;
    if (!user) return next(new Error('UNAUTHORIZED'));
    socket.user = user; next();
  });
  io.on('connection', (socket) => {
    const user = getUser(socket.user.id);
    if (!user || !user.is_active) { socket.disconnect(true); return; }
    try { assertAuthenticated(user); } catch { socket.disconnect(true); return; }
    socket.join(roomFor('campus')); socket.join(roomFor('all_authenticated'));
    if (['student','teacher','admin'].includes(user.role)) socket.join(roomFor('students'));
    if (['teacher','admin'].includes(user.role)) socket.join(roomFor('teachers'));
    if (user.role === 'admin') socket.join('admin');
    socket.emit('location:snapshot', listVisible(user));
    socket.on('location:update', (payload, ack) => {
      try {
        const loc = upsertLive(user.id, payload || {}); const prefs = getPrefs(user.id);
        io.to(roomFor(prefs.audience)).emit('location:updated', { userId: user.id, displayName: user.display_name, role: user.role, latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, recordedAt: loc.recorded_at });
        if (ack) ack({ ok: true });
      } catch (e) { if (ack) ack({ ok: false, error: e.message, code: e.code }); }
    });
    socket.on('location:stop', (_payload, ack) => { try { stopSharing(user.id); io.emit('location:removed', { userId: user.id }); if (ack) ack({ ok: true }); } catch (e) { if (ack) ack({ ok: false, error: e.message }); } });
    socket.on('marker:join', ({ markerId } = {}, ack) => { try { const id = validateId(markerId, 'markerId'); if (!getMarker(id)) throw new Error('Marker not found'); socket.join(markerRoom(id)); if (ack) ack({ ok: true }); } catch (e) { if (ack) ack({ ok: false, error: e.message }); } });
    socket.on('marker:leave', ({ markerId } = {}, ack) => { try { socket.leave(markerRoom(validateId(markerId, 'markerId'))); if (ack) ack({ ok: true }); } catch (e) { if (ack) ack({ ok: false, error: e.message }); } });
  });
}

module.exports = { registerSockets, roomFor, markerRoom, listVisible, canView };
