const path = require('path');
require('dotenv').config();
const { buildTileConfig } = require('./mapTiles');

const root = path.resolve(__dirname, '..', '..');

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  port: Number(env('PORT', '3000')),
  host: env('HOST', '127.0.0.1'),
  baseUrl: env('BASE_URL', 'http://localhost:3000'),
  appName: env('APP_NAME', 'IIUC Live Campus Map'),
  sessionSecret: env('SESSION_SECRET', 'dev-insecure-secret-change-me'),
  databasePath: path.resolve(root, env('DATABASE_PATH', './data/app.db')),
  sessionDbPath: path.resolve(root, env('SESSION_DB_PATH', './data/sessions.db')),
  trustProxy: env('TRUST_PROXY', '0') === '1',
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:3000'),
  registrationEnabled: env('REGISTRATION_ENABLED', '1') === '1',
  adminBootstrapEmail: env('ADMIN_BOOTSTRAP_EMAIL', ''),
  adminBootstrapPassword: env('ADMIN_BOOTSTRAP_PASSWORD', ''),
  tiles: buildTileConfig(process.env),
  root,
};

module.exports = config;
