'use strict';
const express = require('express');
const { asyncHandler, ok, fail } = require('../../utils/http');
const { requireAuth } = require('../../middleware/auth');
const audit = require('../audit/service');
const svc = require('./service');

const router = express.Router();
router.use(requireAuth);
router.get('/', asyncHandler(async (req, res) => ok(res, { items: await svc.list(req.query) })));
router.post('/', asyncHandler(async (req, res) => {
  try {
    const item = await svc.create(req.body || {}, req.user.id);
    await audit.log(req.user.id, 'marker.create', 'marker', item.id, { title: item.title });
    req.app.get('io')?.emit('marker:created', item);
    ok(res, { item });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
router.patch('/:id', asyncHandler(async (req, res) => {
  try {
    const r = await svc.update(req.params.id, req.body || {}, req.user);
    if (r.notFound) return fail(res, 404, 'NOT_FOUND', 'Marker not found');
    if (r.forbidden) return fail(res, 403, 'FORBIDDEN', 'Not marker owner');
    await audit.log(req.user.id, 'marker.update', 'marker', req.params.id, { title: r.item.title });
    req.app.get('io')?.emit('marker:updated', r.item);
    ok(res, { item: r.item });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const r = await svc.remove(req.params.id, req.user);
    if (r.notFound) return fail(res, 404, 'NOT_FOUND', 'Marker not found');
    if (r.forbidden) return fail(res, 403, 'FORBIDDEN', 'Not marker owner');
    await audit.log(req.user.id, 'marker.delete', 'marker', req.params.id, null);
    req.app.get('io')?.emit('marker:deleted', { id: Number(req.params.id) });
    ok(res, { deleted: true });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
module.exports = router;
