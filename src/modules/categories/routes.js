'use strict';
const express = require('express');
const { asyncHandler, ok, fail } = require('../../utils/http');
const { requireAuth, requireRole } = require('../../middleware/auth');
const audit = require('../audit/service');
const svc = require('./service');

const router = express.Router();
router.use(requireAuth);
router.get('/', asyncHandler(async (req, res) => ok(res, { items: await svc.list(req.query.kind, req.query) })));
router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  try {
    const item = await svc.create(req.body || {});
    await audit.log(req.user.id, 'category.create', 'category', item.id, { name: item.name, kind: item.kind });
    ok(res, { item });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
router.patch('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  try {
    const item = await svc.update(req.params.id, req.body || {});
    if (!item) return fail(res, 404, 'NOT_FOUND', 'Category not found');
    await audit.log(req.user.id, 'category.update', 'category', item.id, { name: item.name, kind: item.kind });
    ok(res, { item });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  try {
    const cur = await svc.getById(req.params.id);
    if (!cur) return fail(res, 404, 'NOT_FOUND', 'Category not found');
    await svc.remove(req.params.id);
    await audit.log(req.user.id, 'category.remove', 'category', cur.id, { name: cur.name, kind: cur.kind });
    ok(res, { deleted: true });
  } catch (e) { fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details); }
}));
module.exports = router;
