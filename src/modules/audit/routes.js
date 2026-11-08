const express = require('express');
const { asyncHandler, ok } = require('../../utils/http');
const { requireAuth, requireRole } = require('../../middleware/auth');
const svc = require('../admin/service');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));
router.get('/', asyncHandler(async (req, res) => ok(res, { items: await svc.listAudit(req.query || {}) })));
module.exports = router;
