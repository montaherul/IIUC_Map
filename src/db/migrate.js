'use strict';
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { run, get, exec } = require('./sqlite');
const config = require('../config/env');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
}

async function appliedMigration(name) {
  return get('SELECT 1 FROM schema_migrations WHERE name = ?', [name]);
}

async function markApplied(name) {
  await run('INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES (?, ?)', [name, new Date().toISOString()]);
}

async function migrate() {
  await ensureMigrationsTable();
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(MIGRATIONS_DIR)) fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  const baseline = '0001_baseline';
  if (!(await appliedMigration(baseline))) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await exec(sql);
    await markApplied(baseline);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const name = path.basename(f, '.sql');
    if (await appliedMigration(name)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    try {
      await exec(sql);
      await markApplied(name);
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/duplicate column name|already exists/i.test(msg)) { await markApplied(name); continue; }
      // sharing prefs rebuild may partially apply; if new table exists and old missing, treat as done when safe.
      if (name === '0002_plan2_validation') {
        try {
          await exec('ALTER TABLE campus_locations ADD COLUMN boundary_geojson TEXT');
        } catch (e2) {
          if (!/duplicate column name/i.test(String(e2 && e2.message))) throw e;
        }
        await markApplied(name);
        continue;
      }
      throw e;
    }
  }

  await seed();
}

async function seed() {
  const roles = ['admin', 'teacher', 'student'];
  for (const name of roles) await run('INSERT OR IGNORE INTO roles(name) VALUES (?)', [name]);
  for (const [name, kind] of [['Academic', 'campus'], ['Administrative', 'campus'], ['Facility', 'campus'], ['General', 'marker']]) {
    await run('INSERT OR IGNORE INTO categories(name, kind) VALUES (?, ?)', [name, kind]);
  }
  if (config.adminBootstrapEmail && config.adminBootstrapPassword) {
    const email = String(config.adminBootstrapEmail).toLowerCase().trim();
    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (!existing) {
      const role = await get('SELECT id FROM roles WHERE name = ?', ['admin']);
      const hash = await bcrypt.hash(String(config.adminBootstrapPassword), 12);
      const now = new Date().toISOString();
      await run(
        'INSERT INTO users(email, password_hash, display_name, role_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [email, hash, 'Administrator', role.id, now, now]
      );
      await run('INSERT INTO sharing_preferences(user_id, is_sharing, audience, updated_at) SELECT id, 0, \'none\', ? FROM users WHERE email = ?', [now, email]);
    }
  }
}

module.exports = { migrate };
