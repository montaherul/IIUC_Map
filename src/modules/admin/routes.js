const express = require('express');
const { asyncHandler, ok, fail } = require('../../utils/http');
const { requireAuth, requireRole } = require('../../middleware/auth');
const svc = require('./service');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

function listMeta(r, req) {
  return { items: r.items, total: r.total, limit: r.limit, offset: r.offset, path: req.path };
}

function send(res, r, okStatus = 200) {
  if (!r) return fail(res, 500, 'INTERNAL', 'No result');
  if (r.notFound) return fail(res, 404, 'NOT_FOUND', r.message || 'Not found');
  if (r.forbidden) return fail(res, 403, 'FORBIDDEN', r.message || 'Forbidden');
  if (r.validation) return fail(res, 400, 'VALIDATION', r.message || 'Invalid input');
  if (r.conflict) return fail(res, 409, 'CONFLICT', r.message || 'Conflict');
  return ok(res, r.deleted ? { deleted: true } : { item: r.item }, undefined);
}

// Dashboard
router.get('/stats', asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  ok(res, { stats: await svc.stats(io) });
}));

// User management
router.get('/users', asyncHandler(async (req, res) => ok(res, { users: listMeta(await svc.listUsers(req.query || {}), req) })));
router.post('/users', asyncHandler(async (req, res) => send(res, await svc.createUser(req.body || {}, req.user.id), 201)));
router.get('/users/:id', asyncHandler(async (req, res) => {
  const item = await svc.getUser(req.params.id);
  if (!item) return fail(res, 404, 'NOT_FOUND', 'User not found');
  ok(res, { item });
}));
router.patch('/users/:id', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (body.role != null) return send(res, await svc.setUserRole(req.params.id, body.role, req.user.id));
  if (body.isActive != null) return send(res, await svc.setUserActive(req.params.id, !!body.isActive, req.user.id));
  if (body.displayName != null || body.email != null) return send(res, await svc.updateUserDetails(req.params.id, body, req.user.id));
  return fail(res, 400, 'VALIDATION', 'Provide role, isActive, displayName or email');
}));
router.delete('/users/:id', asyncHandler(async (req, res) => send(res, await svc.setUserActive(req.params.id, false, req.user.id))));
router.post('/users/:id/password-reset', asyncHandler(async (req, res) => {
  const r = await svc.resetUserPassword(req.params.id, req.user.id);
  if (r.notFound) return fail(res, 404, 'NOT_FOUND', 'User not found');
  ok(res, { item: r.item, tempPassword: r.tempPassword });
}));

// Campus management
router.get('/campus', asyncHandler(async (req, res) => ok(res, { items: await svc.listCampus(req.query || {}) })));
router.post('/campus', asyncHandler(async (req, res) => send(res, await svc.saveCampus(null, req.body || {}, req.user.id), 201)));
router.patch('/campus/:id', asyncHandler(async (req, res) => send(res, await svc.saveCampus(req.params.id, req.body || {}, req.user.id))));
router.delete('/campus/:id', asyncHandler(async (req, res) => send(res, await svc.removeCampus(req.params.id, req.user.id))));

// Markers management (admin can touch any marker)
router.get('/markers', asyncHandler(async (req, res) => ok(res, { markers: listMeta(await svc.listMarkers(req.query || {}), req) })));
router.patch('/markers/:id', asyncHandler(async (req, res) => send(res, await svc.updateMarker(req.params.id, req.body || {}, req.user.id))));
router.delete('/markers/:id', asyncHandler(async (req, res) => {
  const active = req.query.active === '1' || req.query.active === 'true';
  return send(res, await svc.deactivateMarker(req.params.id, req.user.id, active));
}));

// Category management
router.get('/categories', asyncHandler(async (req, res) => ok(res, { items: await svc.listCategories(req.query || {}) })));
router.post('/categories', asyncHandler(async (req, res) => send(res, await svc.saveCategory(null, req.body || {}, req.user.id), 201)));
router.patch('/categories/:id', asyncHandler(async (req, res) => send(res, await svc.saveCategory(req.params.id, req.body || {}, req.user.id))));
router.delete('/categories/:id', asyncHandler(async (req, res) => send(res, await svc.removeCategory(req.params.id, req.user.id, { reassignTo: req.query.reassignTo }))));

// Audit logs
router.get('/audit', asyncHandler(async (req, res) => ok(res, { items: await svc.listAudit(req.query || {}) })));

// Locations: aggregate by default; individual lookup requires reason + audit
router.get('/locations', asyncHandler(async (_req, res) => ok(res, await svc.locationAggregate())));
router.get('/locations/:userId', asyncHandler(async (req, res) => {
  if (!req.query.reason || String(req.query.reason).trim().length === 0) {
    return fail(res, 400, 'VALIDATION', 'reason is required for individual location lookup');
  }
  const r = await svc.locationLookup(req.params.userId, req.query.reason, req.user.id);
  if (r.validation) return fail(res, 400, 'VALIDATION', r.message);
  if (r.notFound) return fail(res, 404, 'NOT_FOUND', 'User not found');
  ok(res, r);
}));

// Settings
router.get('/settings', asyncHandler(async (_req, res) => ok(res, { settings: await svc.listSettings() })));
router.get('/settings/:key', asyncHandler(async (req, res) => ok(res, { setting: { key: req.params.key, value: await svc.getSetting(req.params.key) } })));
router.put('/settings/:key', asyncHandler(async (req, res) => {
  const r = await svc.setSetting(req.params.key, req.body == null ? undefined : req.body.value, req.user.id);
  if (r.validation) return fail(res, 400, 'VALIDATION', r.message);
  ok(res, r);
}));

// System health
router.get('/system-health', asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  ok(res, { health: await svc.systemHealth(io) });
}));

module.exports = router;
