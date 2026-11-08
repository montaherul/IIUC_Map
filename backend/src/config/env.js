const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const root = path.resolve(__dirname, '..', '..');

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

module.exports = {
  nodeEnv: env('NODE_ENV', 'development'),
  port: Number(env('PORT', '3000')),
  host: env('HOST', '127.0.0.1'),
  databasePath: path.resolve(root, env('DATABASE_PATH', './data/app.db')),
  root,
};
