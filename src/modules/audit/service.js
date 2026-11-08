'use strict';
const { all, run } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');
const { asString, LIMITS } = require('../../utils/validation');

function safeJson(details) {
  if (details == null) return null;
  if (typeof details === 'string') return details.length > 4000 ? details.slice(0, 4000) : details;
  try {
    // Never log passwords/cookies/tokens/raw GPS coordinates intentionally passed by callers.
    const redacted = JSON.parse(JSON.stringify(details, (k, v) => {
      if (/password|cookie|token|authorization|session|latitude|longitude|accuracy|coords/i.test(k)) return '[redacted]';
      return v;
    }));
    const s = JSON.stringify(redacted);
    return s.length > 4000 ? s.slice(0, 4000) : s;
  } catch {
    return '[unserializable]';
  }
}

async function log(actorUserId, action, targetType, targetId, details) {
  const act = asString(action, 'action', { required: true, max: 120 });
  await run(
    'INSERT INTO audit_logs(actor_user_id, action, target_type, target_id, details, created_at) VALUES (?,?,?,?,?,?)',
    [
      actorUserId == null ? null : Number(actorUserId),
      act,
      targetType == null ? null : asString(String(targetType), 'targetType', { max: 120 }),
      targetId == null ? null : asString(String(targetId), 'targetId', { max: 120 }),
      safeJson(details),
      nowIso(),
    ]
  );
}

async function list({ limit = 200, offset = 0, actorUserId, action, targetType, q } = {}) {
  const where = []; const params = [];
  if (actorUserId) { where.push('a.actor_user_id = ?'); params.push(Number(actorUserId)); }
  if (action) { where.push('a.action = ?'); params.push(String(action).slice(0, 120)); }
  if (targetType) { where.push('a.target_type = ?'); params.push(String(targetType).slice(0, 120)); }
  if (q) { const qs = String(q).slice(0, 200); where.push('(a.action LIKE ? OR a.target_type LIKE ? OR a.target_id LIKE ? OR a.details LIKE ?)'); params.push(`%${qs}%`, `%${qs}%`, `%${qs}%`, `%${qs}%`); }
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);
  return all(
    `SELECT a.*, u.display_name AS actor_name, u.email AS actor_email
     FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    params
  );
}

module.exports = { log, list };
