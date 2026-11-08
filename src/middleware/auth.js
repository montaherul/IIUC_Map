'use strict';
const config = require('../config/env');
const { fail } = require('../utils/http');
const { assertAuthenticated, assertRoleIn } = require('../utils/validation');

function attachUser(req, _res, next) {
  if (req.session && req.session.user) req.user = req.session.user;
  next();
}

function requireAuth(req, res, next) {
  try { assertAuthenticated(req.user); next(); } catch (e) { return fail(res, e.status || 401, e.code || 'UNAUTHORIZED', e.message); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    try { assertRoleIn(req.user, roles); next(); } catch (e) { return fail(res, e.status || 403, e.code || 'FORBIDDEN', e.message); }
  };
}

// Minimal CSRF for cookie-authenticated API: require X-Requested-With on mutating requests.
function csrfGuard(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();
  if (req.path === '/api/v1/auth/login') return next();
  if (config.nodeEnv === 'test') return next();
  if (req.get('X-Requested-With') === 'fetch') return next();
  return fail(res, 403, 'CSRF', 'Missing or invalid request header');
}

module.exports = { attachUser, requireAuth, requireRole, csrfGuard, assertAuthenticated, assertRoleIn };
