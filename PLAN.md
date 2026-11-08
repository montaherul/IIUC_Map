# IIUC Live Campus Map — Implementation Plan

## Phase 0: Setup
- Initialize Node.js project in repo
- Create folder structure per doc §12
- Add .gitignore, .env.example, package.json
- Install dependencies

## Phase 1: Foundation (M1)
- Express server + config
- SQLite connection (better-sqlite3), PRAGMA foreign_keys
- schema.sql + migration runner
- Health endpoint GET /api/v1/health
- Nodemon dev script

## Phase 2: Authentication (M2)
- roles seed (admin/teacher/student)
- users table + bcrypt
- express-session + connect-sqlite3
- CSRF protection
- login/logout/me/register routes
- role middleware

## Phase 3: Campus Map (M3)
- Leaflet + OSM tiles frontend page
- campus_locations CRUD (admin)
- categories CRUD
- search/filter UI

## Phase 4: Markers (M4)
- markers CRUD with ownership
- pagination/filters
- socket marker events

## Phase 5: Location Sharing (M5)
- consent UI + browser Geolocation
- /location/* REST endpoints
- sharing prefs + live_locations upsert
- expiry/stale handling

## Phase 6: Socket.IO (M6)
- session auth on handshake
- audience rooms
- location:update/updated/removed/status
- marker events broadcast
- reconnect snapshot

## Phase 7: Admin (M7)
- dashboard stats
- user management
- campus/category management
- audit logs

## Phase 8: Deployment (M8)
- Raspberry Pi, Nginx, HTTPS/WSS
- backups, tests, recovery

## First increment (§18.1)
Express server + SQLite + migration + health endpoint + login/session scaffolding + basic Leaflet page.
