'use strict';
const express = require('express');
const { asyncHandler, ok, fail } = require('../../utils/http');
const { requireAuth, requireRole } = require('../../middleware/auth');
const audit = require('../audit/service');
const svc = require('./service');

const router = express.Router();
router.use(requireAuth);
router.get('/', asyncHandler(async (req, res) => ok(res, { items: await svc.list(req.query) })));
router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  try {
    const item = await svc.create(req.body, req.user.id);
    await audit.log(req.user.id, 'campus.create', 'campus_location', item.id, { name: item.name });
    ok(res, { item });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
router.patch('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  try {
    const item = await svc.update(req.params.id, req.body || {});
    if (!item) return fail(res, 404, 'NOT_FOUND', 'Campus location not found');
    await audit.log(req.user.id, 'campus.update', 'campus_location', item.id, { name: item.name });
    ok(res, { item });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  try {
    const removed = await svc.remove(req.params.id);
    if (!removed) return fail(res, 404, 'NOT_FOUND', 'Campus location not found');
    await audit.log(req.user.id, 'campus.remove', 'campus_location', req.params.id, null);
    ok(res, { deleted: true });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));

module.exports = router;
