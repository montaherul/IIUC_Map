const { get } = require('../../db/sqlite');

async function findUserByEmail(email) {
  return get(
    `SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
    [String(email || '').toLowerCase().trim()]
  );
}

async function getSessionUser(userId) {
  return get(
    `SELECT u.id, u.email, u.display_name, u.is_active, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [userId]
  );
}

module.exports = { findUserByEmail, getSessionUser };
