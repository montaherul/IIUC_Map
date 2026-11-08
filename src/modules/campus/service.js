const { all, get, run } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');

function validateCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function normalizeId(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const baseSelect = `SELECT c.*, cat.name AS category_name, u.display_name AS created_by_name FROM campus_locations c
  LEFT JOIN categories cat ON cat.id = c.category_id
  LEFT JOIN users u ON u.id = c.created_by`;

async function listAliases(entityId) {
  return all('SELECT alias FROM campus_aliases WHERE entity_type = ? AND entity_id = ? AND is_active = 1 ORDER BY alias', ['campus', entityId]);
}

async function setAliases(entityId, aliases) {
  await run('DELETE FROM campus_aliases WHERE entity_type = ? AND entity_id = ?', ['campus', entityId]);
  const now = nowIso();
  const arr = (Array.isArray(aliases) ? aliases : (aliases == null ? [] : String(aliases).split(',').map(s => s.trim()).filter(Boolean)));
  for (const alias of arr) {
    await run('INSERT OR IGNORE INTO campus_aliases(entity_type, entity_id, alias, is_active, created_at) VALUES (?, ?, ?, 1, ?)', ['campus', entityId, String(alias).slice(0, 120), now]);
  }
}

async function list({ q, categoryId, verifiedOnly, includeInactive, limit = 200, offset = 0, includeAliases = true } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('c.is_active = 1');
  if (q) {
    const like = `%${q}%`;
    where.push('(c.name LIKE ? OR c.description LIKE ? OR c.source LIKE ? OR c.id IN (SELECT entity_id FROM campus_aliases WHERE entity_type = ? AND alias LIKE ?))');
    params.push(like, like, like, 'campus', like);
  }
  if (categoryId) { where.push('c.category_id = ?'); params.push(Number(categoryId)); }
  if (verifiedOnly === true || verifiedOnly === '1' || verifiedOnly === 'true') where.push('c.is_verified = 1');
  params.push(Math.min(Number(limit) || 200, 500), Math.max(Number(offset) || 0, 0));
  const rows = await all(`${baseSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.name LIMIT ? OFFSET ?`, params);
  if (includeAliases) {
    for (const r of rows) r.aliases = await listAliases(r.id);
  }
  return rows;
}

async function getById(id) {
  const row = await get(`${baseSelect} WHERE c.id = ?`, [id]);
  if (row) row.aliases = await listAliases(id);
  return row;
}

async function create(data, userId) {
  const lat = Number(data.latitude), lng = Number(data.longitude);
  if (!data.name || !validateCoords(lat, lng)) throw Object.assign(new Error('name and valid coordinates required'), { status: 400, code: 'VALIDATION' });
  const now = nowIso();
  const r = await run(
    `INSERT INTO campus_locations(name, description, latitude, longitude, category_id, source, verified_at, is_verified, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [String(data.name).trim(), data.description || null, lat, lng, normalizeId(data.categoryId), data.source || null, data.verifiedAt || null, data.isVerified ? 1 : 0, data.isActive === false ? 0 : 1, userId, now, now]
  );
  if (data.aliases) await setAliases(r.lastID, data.aliases);
  return getById(r.lastID);
}

async function update(id, data) {
  const cur = await get('SELECT * FROM campus_locations WHERE id = ?', [id]);
  if (!cur) return null;
  const lat = data.latitude == null ? cur.latitude : Number(data.latitude);
  const lng = data.longitude == null ? cur.longitude : Number(data.longitude);
  if (!validateCoords(lat, lng)) throw Object.assign(new Error('Invalid coordinates'), { status: 400, code: 'VALIDATION' });
  const now = nowIso();
  await run(
    `UPDATE campus_locations SET name=?, description=?, latitude=?, longitude=?, category_id=?, source=?, verified_at=?, is_verified=?, is_active=?, updated_at=? WHERE id=?`,
    [data.name ?? cur.name, data.description ?? cur.description, lat, lng,
     data.categoryId === undefined ? cur.category_id : normalizeId(data.categoryId),
     data.source ?? cur.source, data.verifiedAt ?? cur.verified_at,
     data.isVerified == null ? cur.is_verified : (data.isVerified ? 1 : 0),
     data.isActive == null ? cur.is_active : (data.isActive ? 1 : 0), now, id]
  );
  if (data.aliases !== undefined) await setAliases(id, data.aliases);
  return getById(id);
}

async function remove(id) {
  const cur = await get('SELECT id FROM campus_locations WHERE id = ?', [id]);
  if (!cur) return false;
  await run('UPDATE campus_locations SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
  await run('UPDATE campus_aliases SET is_active = 0 WHERE entity_type = ? AND entity_id = ?', ['campus', id]);
  return true;
}

module.exports = { list, getById, create, update, remove, listAliases, setAliases };