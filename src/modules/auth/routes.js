'use strict';
const express = require('express');
const { asyncHandler, ok, fail } = require('../../utils/http');
const { requireAuth } = require('../../middleware/auth');
const auth = require('./service');

const router = express.Router();

router.post('/register', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (body.password !== undefined && body.confirmPassword !== undefined && body.password !== body.confirmPassword) {
    return fail(res, 400, 'VALIDATION', 'Passwords do not match');
  }
  try {
    const user = await auth.register(body);
    req.session.user = user;
    ok(res, { user });
  } catch (e) {
    fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details);
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  try {
    const user = await auth.login(req.body || {});
    req.session.user = user;
    ok(res, { user });
  } catch (e) {
    fail(res, e.status || 500, e.code || 'ERROR', e.message, e.details);
  }
}));

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => { res.clearCookie('connect.sid'); ok(res, { loggedOut: true }); });
});

router.get('/me', requireAuth, (req, res) => ok(res, { user: req.user }));

module.exports = router;
