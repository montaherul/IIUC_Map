'use strict';

function nowIso() { return new Date().toISOString(); }
function ok(res, data = null, meta = undefined) { const body = { ok: true, data }; if (meta !== undefined) body.meta = meta; return res.json(body); }
function fail(res, status, code, message, details = undefined) { const body = { ok: false, error: { code, message } }; if (details !== undefined) body.error.details = details; return res.status(status).json(body); }
function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  if (err && (err.code === 'VALIDATION' || err.name === 'ValidationError')) return fail(res, 400, 'VALIDATION', err.message, err.details);
  next(err);
}); };
function parseJsonDetails(details) {
  if (details == null) return null;
  if (typeof details !== 'string') return details;
  try { return JSON.parse(details); } catch { return details; }
}

module.exports = { nowIso, ok, fail, asyncHandler, parseJsonDetails };
