const { all, get, run } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');

function parseGeoJSON(geojson) {
  if (!geojson || typeof geojson !== 'object') throw Object.assign(new Error('Invalid GeoJSON'), { status: 400, code: 'VALIDATION' });
  if (geojson.type !== 'Polygon' && geojson.type !== 'MultiPolygon') {
    throw Object.assign(new Error('Only Polygon or MultiPolygon boundaries are supported'), { status: 400, code: 'VALIDATION' });
  }
  const coords = geojson.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) throw Object.assign(new Error('Boundary coordinates required'), { status: 400, code: 'VALIDATION' });

  const rings = geojson.type === 'Polygon' ? [coords] : coords;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) throw Object.assign(new Error('Each ring needs at least 4 points'), { status: 400, code: 'VALIDATION' });
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) throw Object.assign(new Error('Each coordinate must be [lng, lat]'), { status: 400, code: 'VALIDATION' });
      const [lng, lat] = pt;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw Object.assign(new Error('Coordinate out of range'), { status: 400, code: 'VALIDATION' });
      }
    }
    // Closed ring check
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw Object.assign(new Error('Boundary ring must be closed (first point == last point)'), { status: 400, code: 'VALIDATION' });
    }
  }
  return JSON.stringify(geojson);
}

async function list({ verifiedOnly, includeInactive, limit = 200, offset = 0 } = {}) {
  const where = [];
  if (includeInactive !== true) where.push('b.is_active = 1');
  if (verifiedOnly === true || verifiedOnly === '1' || verifiedOnly === 'true') where.push('b.is_verified = 1');
  const params = [];
  params.push(Math.min(Number(limit) || 200, 500), Math.max(Number(offset) || 0, 0));
  return all(
    `SELECT b.*, u.display_name AS created_by_name, v.display_name AS verified_by_name
     FROM campus_boundaries b
     LEFT JOIN users u ON u.id = b.created_by
     LEFT JOIN users v ON v.id = b.verified_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY b.is_verified DESC, b.name LIMIT ? OFFSET ?`,
    params
  );
}

async function getById(id) {
  return get('SELECT * FROM campus_boundaries WHERE id = ?', [id]);
}

async function create(data, userId) {
  if (!data.name) throw Object.assign(new Error('name required'), { status: 400, code: 'VALIDATION' });
  const geojson = parseGeoJSON(data.geojson);
  const now = nowIso();
  const r = await run(
    `INSERT INTO campus_boundaries(name, geojson, is_verified, verified_at, verified_by, source, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [String(data.name).trim(), geojson, data.isVerified ? 1 : 0, data.isVerified ? now : null, data.verifiedBy || null, data.source || null, data.isActive === false ? 0 : 1, userId, now, now]
  );
  return get('SELECT * FROM campus_boundaries WHERE id = ?', [r.lastID]);
}

async function update(id, data) {
  const cur = await get('SELECT * FROM campus_boundaries WHERE id = ?', [id]);
  if (!cur) return null;
  const geojson = data.geojson ? parseGeoJSON(data.geojson) : cur.geojson;
  const now = nowIso();
  const verifiedAt = data.isVerified == null ? cur.verified_at : (data.isVerified ? (cur.verified_at || now) : null);
  await run(
    `UPDATE campus_boundaries SET name=?, geojson=?, is_verified=?, verified_at=?, verified_by=?, source=?, is_active=?, updated_at=? WHERE id=?`,
    [data.name ?? cur.name, geojson,
     data.isVerified == null ? cur.is_verified : (data.isVerified ? 1 : 0),
     verifiedAt,
     data.verifiedBy == null ? cur.verified_by : data.verifiedBy,
     data.source ?? cur.source,
     data.isActive == null ? cur.is_active : (data.isActive ? 1 : 0),
     now, id]
  );
  return get('SELECT * FROM campus_boundaries WHERE id = ?', [id]);
}

async function remove(id) {
  const cur = await get('SELECT id FROM campus_boundaries WHERE id = ?', [id]);
  if (!cur) return false;
  await run('UPDATE campus_boundaries SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
  return true;
}

module.exports = { list, create, update, remove, getById, parseGeoJSON };