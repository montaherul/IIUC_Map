const { all, get, run } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');

function validateCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function listAliases(entityId) {
  return all('SELECT alias FROM campus_aliases WHERE entity_type = ? AND entity_id = ? AND is_active = 1 ORDER BY alias', ['marker', entityId]);
}

async function setAliases(entityId, aliases) {
  await run('DELETE FROM campus_aliases WHERE entity_type = ? AND entity_id = ?', ['marker', entityId]);
  const now = nowIso();
  const arr = (Array.isArray(aliases) ? aliases : (aliases == null ? [] : String(aliases).split(',').map(s => s.trim()).filter(Boolean)));
  for (const alias of arr) {
    await run('INSERT OR IGNORE INTO campus_aliases(entity_type, entity_id, alias, is_active, created_at) VALUES (?, ?, ?, 1, ?)', ['marker', entityId, String(alias).slice(0, 120), now]);
  }
}

async function list({ q, categoryId, owner, limit = 200, offset = 0, includeAliases = true } = {}) {
  const where = ['m.is_active = 1'];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where.push('(m.title LIKE ? OR m.description LIKE ? OR m.id IN (SELECT entity_id FROM campus_aliases WHERE entity_type = ? AND alias LIKE ?))');
    params.push(like, like, 'marker', like);
  }
  if (categoryId) { where.push('m.category_id = ?'); params.push(Number(categoryId)); }
  if (owner) { where.push('m.created_by = ?'); params.push(Number(owner)); }
  params.push(Math.min(Number(limit) || 200, 500), Number(offset) || 0);
  const rows = await all(
    `SELECT m.*, cat.name AS category_name, u.display_name AS owner_name FROM markers m
     LEFT JOIN categories cat ON cat.id = m.category_id
     JOIN users u ON u.id = m.created_by
     WHERE ${where.join(' AND ')} ORDER BY m.updated_at DESC LIMIT ? OFFSET ?`,
    params
  );
  if (includeAliases) {
    for (const r of rows) r.aliases = await listAliases(r.id);
  }
  return rows;
}

async function getById(id) { return get('SELECT * FROM markers WHERE id = ? AND is_active = 1', [id]); }

async function create(data, userId) {
  const lat = Number(data.latitude), lng = Number(data.longitude);
  if (!data.title || !validateCoords(lat, lng)) throw Object.assign(new Error('title and valid coordinates required'), { status: 400, code: 'VALIDATION' });
  const now = nowIso();
  const r = await run(
    'INSERT INTO markers(title, description, latitude, longitude, category_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [String(data.title).trim(), data.description || null, lat, lng, data.categoryId || null, userId, now, now]
  );
  if (data.aliases) await setAliases(r.lastID, data.aliases);
  return get('SELECT m.*, cat.name AS category_name, u.display_name AS owner_name FROM markers m LEFT JOIN categories cat ON cat.id=m.category_id JOIN users u ON u.id=m.created_by WHERE m.id=?', [r.lastID]);
}

async function update(id, data, user) {
  const cur = await getById(id);
  if (!cur) return { notFound: true };
  if (user.role !== 'admin' && cur.created_by !== user.id) return { forbidden: true };
  const lat = data.latitude == null ? cur.latitude : Number(data.latitude);
  const lng = data.longitude == null ? cur.longitude : Number(data.longitude);
  if (!validateCoords(lat, lng)) throw Object.assign(new Error('Invalid coordinates'), { status: 400, code: 'VALIDATION' });
  const now = nowIso();
  await run('UPDATE markers SET title=?, description=?, latitude=?, longitude=?, category_id=?, updated_at=? WHERE id=?',
    [data.title ?? cur.title, data.description ?? cur.description, lat, lng, data.categoryId ?? cur.category_id, now, id]);
  if (data.aliases !== undefined) await setAliases(id, data.aliases);
  return { item: await get('SELECT m.*, cat.name AS category_name, u.display_name AS owner_name FROM markers m LEFT JOIN categories cat ON cat.id=m.category_id JOIN users u ON u.id=m.created_by WHERE m.id=?', [id]) };
}

async function remove(id, user) {
  const cur = await getById(id);
  if (!cur) return { notFound: true };
  if (user.role !== 'admin' && cur.created_by !== user.id) return { forbidden: true };
  await run('UPDATE markers SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
  await run('UPDATE campus_aliases SET is_active = 0 WHERE entity_type = ? AND entity_id = ?', ['marker', id]);
  return { deleted: true };
}

module.exports = { list, create, update, remove, getById, listAliases, setAliases };