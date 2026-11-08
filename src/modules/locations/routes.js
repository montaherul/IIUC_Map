'use strict';
const express = require('express');
const { asyncHandler, ok, fail } = require('../../utils/http');
const { requireAuth, requireRole } = require('../../middleware/auth');
const svc = require('./service');

const router = express.Router();

function emitLocation(io, user, loc, prefs) {
  if (!io || !prefs?.is_sharing || prefs.audience === 'none') return;
  io.to(`aud:${prefs.audience}`).emit('location:updated', {
    userId: user.id, displayName: user.display_name, role: user.role, audience: prefs.audience,
    latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, recordedAt: loc.recorded_at, expiresAt: prefs.expires_at || null,
  });
}

router.use(requireAuth);
router.get('/status', asyncHandler(async (req, res) => ok(res, await svc.getStatus(req.user.id))));
router.get('/prefs', asyncHandler(async (req, res) => ok(res, { prefs: await svc.getPrefs(req.user.id) })));
router.post('/prefs', asyncHandler(async (req, res) => {
  try {
    const prefs = await svc.setPrefs(req.user.id, req.body || {});
    if (!prefs.is_sharing) req.app.get('io')?.emit('location:removed', { userId: req.user.id, reason: 'stopped' });
    ok(res, { prefs });
  } catch (e) { fail(res, e.status || 400, e.code || 'ERROR', e.message, e.details); }
}));
router.post('/update', asyncHandler(async (req, res) => {
  try {
    const loc = await svc.upsertLive(req.user.id, req.body || {});
    const prefs = await svc.getPrefs(req.user.id);
    emitLocation(req.app.get('io'), req.user, loc, prefs);
    ok(res, { location: loc, prefs });
  } catch (e) {
    if (e.code === 'EXPIRED' || e.code === 'NOT_SHARING') req.app.get('io')?.emit('location:removed', { userId: req.user.id, reason: String(e.code).toLowerCase() });
    fail(res, e.status || 400, e.code || 'ERROR', e.message, e.details);
  }
}));
router.post('/stop', asyncHandler(async (req, res) => {
  const prefs = await svc.stop(req.user.id);
  req.app.get('io')?.emit('location:removed', { userId: req.user.id, reason: 'stopped' });
  ok(res, { stopped: true, prefs });
}));
router.get('/visible', asyncHandler(async (req, res) => ok(res, { items: await svc.listVisible(req.user) })));

module.exports = router;
