const express = require('express');
const { ok } = require('../utils/http');

const router = express.Router();
router.get('/health', (_req, res) => {
  ok(res, { status: 'up', service: 'iiuc-live-campus-map', time: new Date().toISOString() });
});
module.exports = router;
