# IIUC Live Campus Map

Node.js + Express + SQLite + Socket.IO + Leaflet/OpenStreetMap scaffold for CSE-3634. The active server is `src/server.js` (serves API and `public/` pages).

## Setup

Prerequisites: Node.js 18+ (tested with Node 24), npm.

```powershell
cd "D:\IIUC Map\repo"
npm install
Copy-Item .env.example .env
```

Edit `.env` before first run. At minimum set a strong `SESSION_SECRET`. For local bootstrap, `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` create an admin on migrate if that email does not exist; change/remove after bootstrap.

## Environment

`.env.example` keys:

| Variable | Purpose | Default/example |
|---|---|---|
| `NODE_ENV` | `development`/`production`/`test` | `development` |
| `PORT`, `HOST` | HTTP bind | `3000`, `127.0.0.1` |
| `BASE_URL`, `CORS_ORIGIN` | Client/socket origin | `http://localhost:3000` |
| `SESSION_SECRET` | Session signing secret (required for real use) | replace |
| `DATABASE_PATH` | SQLite DB path (relative to repo root) | `./backend/database/app.db` |
| `SESSION_DB_PATH` | Session SQLite path | `./backend/database/sessions.db` |
| `TRUST_PROXY` | Enable when behind TLS proxy | `0` |
| `APP_NAME` | Public app name | `IIUC Live Campus Map` |
| `REGISTRATION_ENABLED` | `1` allows `/register` and register API | `1` |
| `ADMIN_BOOTSTRAP_EMAIL/PASSWORD` | One-time bootstrap admin | local only |

## Run

```powershell
npm run migrate   # create schema + seed roles/categories/bootstrap admin
npm run dev       # nodemon src/server.js
# or
npm start         # node src/server.js
```

Open `http://localhost:3000`.

## Campus data (OpenStreetMap)

The map is populated with real IIUC buildings, roads/paths, and campus facilities from
OpenStreetMap (ODbL), not scraped from Google Maps. The snapshot is committed as
`data/iiuc-campus.geojson`; seed it after migrating:

```powershell
npm run seed:campus
```

The seed is idempotent and only replaces rows whose `source` starts with `OpenStreetMap`.
Source, licence, filters, and limitations are documented in
`data/IIUC_CAMPUS_PROVENANCE.md`. Rebuild the GeoJSON from an OSM XML extract with
`node scripts/build-iiuc-campus-geojson.js <extract.osm>`.

Useful scripts:

- `npm run lint` — syntax checks (`node --check`) on key server/test files.
- `npm test` — basic Node test harness (`tests/run.js`) using isolated temp SQLite DB/session store.
- `npm run check` — syntax check + tests.

## Authentication and API usage

- Session auth uses HTTP-only cookie (`connect.sid`).
- Mutating API requests require header `X-Requested-With: fetch` (CSRF guard) and `Content-Type: application/json` for JSON bodies.
- Rate limiting is applied to `/api` and stricter limits to login/register.
- All API responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

## Core API summary

See `docs/API.md` for details.

- Auth: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- Public config: `GET /api/v1/config/public`
- Health: `GET /api/v1/health`
- Campus/map (auth): `GET/POST/PATCH/DELETE /api/v1/campus`
- Categories (auth; admin manage): `GET/POST /api/v1/categories`
- Markers (auth; owner/admin modify): `GET/POST/PATCH/DELETE /api/v1/markers`
- Live location (auth): `GET/POST /api/v1/location/prefs`, `GET /api/v1/location/status`, `POST /api/v1/location/update`, `POST /api/v1/location/stop`, `GET /api/v1/location/visible`
- Admin (admin role): `GET /api/v1/admin/stats|users|campus|categories|audit`, `PATCH /api/v1/admin/users/:id`, campus/category CRUD
- Audit (admin): `GET /api/v1/audit`

## Socket contract

See `docs/SOCKET_CONTRACT.md`. Socket.IO uses the session cookie; unauthenticated sockets are rejected. Events include snapshots and `location:updated`/`location:removed` with audience-filtered delivery.

## Privacy and limitations

- Privacy policy: `docs/PRIVACY_POLICY.md`
- Known limitations: `docs/KNOWN_LIMITATIONS.md`

## Notes

- `backend/src/` contains an older/minimal scaffold; do not use it for runtime. Active implementation is under `src/`.
- Do not commit `.env`, SQLite DBs, or secrets.
