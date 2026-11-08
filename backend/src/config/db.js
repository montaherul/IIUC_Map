const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./env');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

module.exports = { db };
