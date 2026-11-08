'use strict';
const { all, get, run } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');
const audit = require('../audit/service');
const { asString, validateId, LIMITS } = require('../../utils/validation');

async function stats() {
  const [users, activeUsers, campus, markers, live, sharing, auditCount, categories, byRole] = await Promise.all([
    get('SELECT COUNT(*) AS n FROM users'),
    get('SELECT COUNT(*) AS n FROM users WHERE is_active=1'),
    get('SELECT COUNT(*) AS n FROM campus_locations WHERE is_active=1'),
    get('SELECT COUNT(*) AS n FROM markers WHERE is_active=1'),
    get('SELECT COUNT(*) AS n FROM live_locations'),
    get("SELECT COUNT(*) AS n FROM sharing_preferences WHERE is_sharing=1"),
    get('SELECT COUNT(*) AS n FROM audit_logs'),
    get('SELECT COUNT(*) AS n FROM categories WHERE is_active=1'),
    all(`SELECT r.name AS role, COUNT(u.id) AS count FROM roles r LEFT JOIN users u ON u.role_id=r.id GROUP BY r.id, r.name ORDER BY r.name`),
  ]);
  return {
    users: users.n, activeUsers: activeUsers.n, campusLocations: campus.n, markers: markers.n,
    liveSharing: live.n, sharingEnabled: sharing.n, auditLogs: auditCount.n, categories: categories.n,
    usersByRole: byRole, generatedAt: nowIso(),
  };
}

async function activeAdminCount(excludeUserId = null) {
  const row = excludeUserId == null
    ? await get(`SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active=1`)
    : await get(`SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active=1 AND u.id <> ?`, [excludeUserId]);
  return Number(row && row.n || 0);
}

async function assertNotLastAdmin(targetUserId, action) {
  const target = await get(`SELECT u.id, u.is_active, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`, [targetUserId]);
  if (!target || target.role !== 'admin' || !target.is_active) return target;
  if (await activeAdminCount(targetUserId) < 1) {
    return { forbidden: true, message: `Cannot ${action} the last active admin` };
  }
  return target;
}

async function listUsers({ q, role, active, limit = 200, offset = 0 } = {}) {
  const where = []; const params = [];
  if (q) { const qs = asString(q, 'q', { max: 200 }); if (qs) { where.push('(u.email LIKE ? OR u.display_name LIKE ?)'); params.push(`%${qs}%`, `%${qs}%`); } }
  if (role) { where.push('r.name = ?'); params.push(String(role)); }
  if (active === '0' || active === 0 || active === false) where.push('u.is_active = 0');
  else if (active === '1' || active === 1 || active === true) where.push('u.is_active = 1');
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500), Math.max(Number(offset) || 0, 0));
  return all(
    `SELECT u.id, u.email, u.display_name, u.is_active, u.created_at, u.updated_at, r.name AS role
     FROM users u JOIN roles r ON r.id=u.role_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    params
  );
}

async function getUser(id) {
  return get(
    `SELECT u.id, u.email, u.display_name, u.is_active, u.created_at, u.updated_at, r.name AS role
     FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`,
    [validateId(id)]
  );
}

async function setUserActive(id, active, actorId) {
  const uid = validateId(id);
  const target = await get(`SELECT u.id, u.is_active, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`, [uid]);
  if (!target) return { notFound: true };
  if (!active) {
    if (Number(uid) === Number(actorId)) return { forbidden: true, message: 'Cannot disable own account' };
    const guard = await assertNotLastAdmin(uid, 'deactivate');
    if (guard && guard.forbidden) return guard;
  }
  const now = nowIso();
  await run('UPDATE users SET is_active=?, updated_at=? WHERE id=?', [active ? 1 : 0, now, uid]);
  if (!active) {
    await run('DELETE FROM live_locations WHERE user_id=?', [uid]);
    await run(`UPDATE sharing_preferences SET is_sharing=0, audience='none', expires_at=NULL, updated_at=? WHERE user_id=?`, [now, uid]);
  }
  await audit.log(actorId, active ? 'user.enable' : 'user.disable', 'user', uid, { previousActive: !!target.is_active });
  return { item: await getUser(uid) };
}

async function setUserRole(id, roleName, actorId) {
  const uid = validateId(id);
  const target = await getUser(uid);
  if (!target) return { notFound: true };
  const role = await get('SELECT id, name FROM roles WHERE name=?', [String(roleName || '').trim().toLowerCase()]);
  if (!role) return { validation: true, message: 'Unknown role' };
  if (target.role === 'admin' && role.name !== 'admin') {
    if (Number(uid) === Number(actorId)) return { forbidden: true, message: 'Cannot demote own admin account' };
    const guard = await assertNotLastAdmin(uid, 'demote');
    if (guard && guard.forbidden) return guard;
  }
  await run('UPDATE users SET role_id=?, updated_at=? WHERE id=?', [role.id, nowIso(), uid]);
  await audit.log(actorId, 'user.role_change', 'user', uid, { from: target.role, to: role.name });
  return { item: await getUser(uid) };
}

async function listCampus({ q, categoryId, active, verifiedOnly, limit = 200, offset = 0 } = {}) {
  const where = []; const params = [];
  if (active === 'all') { /* no filter */ }
  else if (active === '0' || active === 0 || active === false) where.push('c.is_active = 0');
  else where.push('c.is_active = 1');
  if (q) { const qs = asString(q, 'q', { max: 200 }); if (qs) { where.push('(c.name LIKE ? OR c.description LIKE ?)'); params.push(`%${qs}%`, `%${qs}%`); } }
  if (categoryId) { where.push('c.category_id = ?'); params.push(validateId(categoryId, 'categoryId')); }
  if (verifiedOnly) where.push('c.is_verified = 1');
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500), Math.max(Number(offset) || 0, 0));
  return all(
    `SELECT c.*, cat.name AS category_name, u.display_name AS created_by_name
     FROM campus_locations c
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN users u ON u.id = c.created_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.updated_at DESC, c.name LIMIT ? OFFSET ?`,
    params
  );
}

const campusSvc = require('../campus/service');
async function saveCampus(id, data, actorId) {
  try {
    if (id) {
      const item = await campusSvc.update(id, data || {});
      if (!item) return { notFound: true };
      await audit.log(actorId, 'campus.update', 'campus_location', item.id, { name: item.name });
      return { item };
    }
    const item = await campusSvc.create(data || {}, actorId);
    await audit.log(actorId, 'campus.create', 'campus_location', item.id, { name: item.name });
    return { item };
  } catch (e) {
    if (e && (e.code === 'VALIDATION' || e.status === 400)) return { validation: true, message: e.message };
    throw e;
  }
}
async function removeCampus(id, actorId) {
  const item = await campusSvc.getById(id);
  if (!item) return { notFound: true };
  await campusSvc.remove(id);
  await audit.log(actorId, 'campus.remove', 'campus_location', validateId(id), { name: item.name });
  return { deleted: true };
}

const categorySvc = require('../categories/service');
async function listCategories({ kind, active } = {}) { return categorySvc.list(kind, { includeInactive: active === 'all' || active === '0' || active === 0 || active === false }); }
async function saveCategory(id, data, actorId) {
  try {
    if (id) {
      const item = await categorySvc.update(id, data || {});
      if (!item) return { notFound: true };
      await audit.log(actorId, 'category.update', 'category', item.id, { name: item.name, kind: item.kind });
      return { item };
    }
    const item = await categorySvc.create(data || {});
    await audit.log(actorId, 'category.create', 'category', item.id, { name: item.name, kind: item.kind });
    return { item };
  } catch (e) {
    if (e && e.status === 409) return { conflict: true, message: e.message };
    if (e && (e.code === 'VALIDATION' || e.status === 400)) return { validation: true, message: e.message };
    throw e;
  }
}
async function removeCategory(id, actorId) {
  try {
    const cur = await categorySvc.getById(id);
    if (!cur) return { notFound: true };
    await categorySvc.remove(id);
    await audit.log(actorId, 'category.remove', 'category', cur.id, { name: cur.name, kind: cur.kind });
    return { deleted: true };
  } catch (e) {
    if (e && e.status === 409) return { conflict: true, message: e.message };
    throw e;
  }
}

async function listAudit(query) { return audit.list(query); }

module.exports = {
  stats, listUsers, getUser, setUserActive, setUserRole,
  listCampus, saveCampus, removeCampus,
  listCategories, saveCategory, removeCategory,
  listAudit, activeAdminCount,
};
