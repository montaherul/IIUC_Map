'use strict';
const bcrypt = require('bcrypt');
const { get, run } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');
const config = require('../../config/env');
const { normalizeEmail, validatePassword, asString, LIMITS, ValidationError } = require('../../utils/validation');

const SELF_REGISTER_ROLES = new Set(['student', 'teacher']);

function safeUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, display_name: row.display_name, role: row.role, is_active: !!row.is_active };
}

async function findUserByEmail(email) {
  const n = normalizeEmail(email, { required: false });
  if (!n) return null;
  return get(
    `SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE lower(u.email) = ?`,
    [n]
  );
}

async function getSessionUser(userId) {
  return get(
    `SELECT u.id, u.email, u.display_name, u.is_active, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [userId]
  );
}

async function register({ email, password, displayName, role: requestedRole, termsAccepted, studentId } = {}) {
  if (!config.registrationEnabled) throw Object.assign(new Error('Registration disabled'), { status: 403, code: 'REG_DISABLED' });
  const normalizedEmail = normalizeEmail(email);
  const name = asString(displayName, 'displayName', { required: true, max: LIMITS.displayName });
  const roleName = SELF_REGISTER_ROLES.has(String(requestedRole || 'student').toLowerCase())
    ? String(requestedRole || 'student').toLowerCase()
    : null;
  if (!roleName) throw new ValidationError('Role request must be student or teacher');
  if (!termsAccepted) throw new ValidationError('Terms consent is required');
  validatePassword(password);
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) throw Object.assign(new Error('Registration could not be completed'), { status: 409, code: 'CONFLICT' });
  const role = await get('SELECT id FROM roles WHERE name = ?', [roleName]);
  if (!role) throw new ValidationError('Role unavailable');
  const hash = await bcrypt.hash(password, 12);
  const now = nowIso();
  void studentId;
  const r = await run(
    'INSERT INTO users(email, password_hash, display_name, role_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    [normalizedEmail, hash, name, role.id, now, now]
  );
  await run('INSERT INTO sharing_preferences(user_id, is_sharing, audience, updated_at) VALUES (?, 0, \'none\', ?)', [r.lastID, now]);
  return safeUser(await getSessionUser(r.lastID));
}

async function login({ email, password } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const pwd = typeof password === 'string' ? password : '';
  const user = await findUserByEmail(normalizedEmail);
  if (!user || !user.is_active) throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'INVALID_CREDENTIALS' });
  const ok = await bcrypt.compare(pwd, user.password_hash);
  if (!ok) throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'INVALID_CREDENTIALS' });
  return safeUser(user);
}

module.exports = { register, login, getSessionUser, findUserByEmail };
