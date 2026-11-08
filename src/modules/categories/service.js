'use strict';
const { all, get, run } = require('../../db/sqlite');
const { asString, validateId, LIMITS } = require('../../utils/validation');
const KINDS = new Set(['campus', 'marker']);

async function list(kind, opts = {}) {
  const where = [];
  const params = [];
  if (!opts.includeInactive) where.push('is_active = 1');
  if (kind) { const k = String(kind).trim(); if (!KINDS.has(k)) throw Object.assign(new Error('kind is invalid'), { status: 400, code: 'VALIDATION' }); where.push('kind = ?'); params.push(k); }
  if (opts.q) { const qs = asString(opts.q, 'q', { max: 200 }); if (qs) { where.push('name LIKE ?'); params.push(`%${qs}%`); } }
  return all(`SELECT * FROM categories ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY kind, name`, params);
}

async function getById(id) { return get('SELECT * FROM categories WHERE id = ?', [validateId(id)]); }

async function create({ name, kind } = {}) {
  const n = asString(name, 'name', { required: true, max: LIMITS.categoryName });
  const k = String(kind || '').trim();
  if (!KINDS.has(k)) throw Object.assign(new Error('kind must be campus or marker'), { status: 400, code: 'VALIDATION' });
  try {
    const r = await run('INSERT INTO categories(name, kind, is_active) VALUES (?, ?, 1)', [n, k]);
    return getById(r.lastID);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw Object.assign(new Error('Category already exists for that kind'), { status: 409, code: 'CONFLICT' });
    throw e;
  }
}

async function update(id, data = {}) {
  const cur = await getById(id);
  if (!cur) return null;
  const name = data.name == null ? cur.name : asString(data.name, 'name', { required: true, max: LIMITS.categoryName });
  const kind = data.kind == null ? cur.kind : String(data.kind).trim();
  if (!KINDS.has(kind)) throw Object.assign(new Error('kind must be campus or marker'), { status: 400, code: 'VALIDATION' });
  const active = data.isActive == null ? cur.is_active : (data.isActive ? 1 : 0);
  try {
    await run('UPDATE categories SET name=?, kind=?, is_active=? WHERE id=?', [name, kind, active, cur.id]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw Object.assign(new Error('Category already exists for that kind'), { status: 409, code: 'CONFLICT' });
    throw e;
  }
  return getById(cur.id);
}

async function remove(id) {
  const cur = await getById(id);
  if (!cur) return false;
  const [campusRef, markerRef] = await Promise.all([
    get('SELECT 1 AS x FROM campus_locations WHERE category_id = ? AND is_active = 1 LIMIT 1', [cur.id]),
    get('SELECT 1 AS x FROM markers WHERE category_id = ? AND is_active = 1 LIMIT 1', [cur.id]),
  ]);
  if (campusRef || markerRef) throw Object.assign(new Error('Category is referenced and cannot be deleted; reassign or deactivate references'), { status: 409, code: 'CONFLICT' });
  await run('UPDATE categories SET is_active = 0 WHERE id = ?', [cur.id]);
  return true;
}

module.exports = { list, getById, create, update, remove };
