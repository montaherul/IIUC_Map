const express = require('express');
const config = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'up', service: 'iiuc-live-campus-map', time: new Date().toISOString() });
  });
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
