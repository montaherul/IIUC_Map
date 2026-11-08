const { all } = require('../../db/sqlite');

const MAX_RESULTS = 50;

function normalizeLimit(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return MAX_RESULTS;
  return Math.min(Math.floor(n), 200);
}

function escapeLike(s) {
  return String(s ?? '').replace(/[\\%_]/g, (c) => '\\' + c);
}

// Unified search across campus locations and markers by name/aliases/category/description.
// Returns a single ranked list suitable for a search dropdown.
async function search({ q, category, kind, limit } = {}) {
  const lim = normalizeLimit(limit);
  const results = [];
  if (q && String(q).trim().length >= 1) {
    const like = `%${escapeLike(q)}%`;
    const campusRows = await all(
      `SELECT c.id, c.name, c.description, c.latitude, c.longitude, c.category_id, cat.name AS category_name, c.is_verified, c.is_active, 'campus' AS entity_type
       FROM campus_locations c
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE c.is_active = 1 AND (c.name LIKE ? ESCAPE '\' OR c.description LIKE ? ESCAPE '\' OR c.source LIKE ? ESCAPE '\'
         OR c.id IN (SELECT entity_id FROM campus_aliases WHERE entity_type='campus' AND alias LIKE ? ESCAPE '\'))
       ORDER BY c.name LIMIT ?`,
      [like, like, like, like, lim]
    );
    const markerRows = await all(
      `SELECT m.id, m.title AS name, m.description, m.latitude, m.longitude, m.category_id, cat.name AS category_name, 1 AS is_verified, m.is_active, 'marker' AS entity_type
       FROM markers m
       LEFT JOIN categories cat ON cat.id = m.category_id
       WHERE m.is_active = 1 AND (m.title LIKE ? ESCAPE '\' OR m.description LIKE ? ESCAPE '\'
         OR m.id IN (SELECT entity_id FROM campus_aliases WHERE entity_type='marker' AND alias LIKE ? ESCAPE '\'))
       ORDER BY m.title LIMIT ?`,
      [like, like, like, lim]
    );
    results.push(...campusRows, ...markerRows);
  } else {
    // No query: return a curated list (active verified campus + recent markers) for browsing.
    const campusRows = await all(
      `SELECT c.id, c.name, c.description, c.latitude, c.longitude, c.category_id, cat.name AS category_name, c.is_verified, c.is_active, 'campus' AS entity_type
       FROM campus_locations c LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE c.is_active = 1 ORDER BY c.is_verified DESC, c.name LIMIT ?`,
      [Math.floor(lim / 2)]
    );
    const markerRows = await all(
      `SELECT m.id, m.title AS name, m.description, m.latitude, m.longitude, m.category_id, cat.name AS category_name, 1 AS is_verified, m.is_active, 'marker' AS entity_type
       FROM markers m LEFT JOIN categories cat ON cat.id = m.category_id
       WHERE m.is_active = 1 ORDER BY m.updated_at DESC LIMIT ?`,
      [Math.floor(lim / 2)]
    );
    results.push(...campusRows, ...markerRows);
  }

  // Optional category filter (by category name or id).
  let filtered = results;
  if (category) {
    const key = String(category).toLowerCase();
    filtered = results.filter((r) => {
      const catId = String(r.category_id ?? '');
      const catName = String(r.category_name ?? '').toLowerCase();
      return catId === key || catName === key || catName.includes(key);
    });
  }
  if (kind) {
    filtered = filtered.filter((r) => r.entity_type === String(kind));
  }
  return filtered.slice(0, lim);
}

module.exports = { search, escapeLike, normalizeLimit };