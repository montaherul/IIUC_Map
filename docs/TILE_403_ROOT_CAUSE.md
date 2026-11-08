# Tile 403 Root Cause Analysis — OpenStreetMap Base Map

## Symptom
Leaflet repeatedly shows `HTTP 403 Access blocked` for base-map tiles. Campus overlays (buildings, roads, markers, live users) still render, but the raster background is blank.

## Root cause
OpenStreetMap's official tile servers (`tile.openstreetmap.org` and the `{s}.tile.openstreetmap.org` subdomains) are volunteer-run and enforce the [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/). They return **HTTP 403** when a request:

- lacks a valid browser `Referer` header (required for interactive embedding);
- exceeds per-IP rate limits;
- originates from a blocked or flagged IP;
- looks like bulk downloading, offline prefetching, cache-busting, or automated scraping; or
- omits/alters the required visible attribution.

Leaflet requests tiles as normal `` tags. Browsers normally attach `Referer` automatically, but privacy settings, private browsing, corporate proxies, or a high tile-request rate can strip/trigger limits. On `localhost` and under repeated page reloads during development, OSM rate-limiting is common. Per OSM policy, deployed/production applications must use a dedicated tile provider rather than the volunteer servers.

## What is NOT the fix (and why)
- **Do not spoof `User-Agent`.** That bypasses OSM's policy enforcement and is prohibited.
- **Do not switch blindly to another public tile server without checking its usage policy.** Each provider has its own terms.
- **Do not bulk-download, prefetch, or cache tiles offline beyond the browser's normal cache.**

## Correct fix (implemented)
The map tile layer is now **configurable and provider-aware**:

1. **Configurable provider registry** — `src/config/mapTiles.js` defines built-in providers whose policies are compatible with this app:
   - `osm-standard`: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (official OSM; requires Referer; best-effort interactive use only).
   - `osm-de`: `https://tile.openstreetmap.de/{z}/{x}/{y}.png` (OSM Germany mirror; non-commercial embedding permitted; `requiresReferer: false`).
   Custom providers can be added via `TILE_PROVIDERS_JSON`, and the default/URL/attribution can be overridden via `TILE_PROVIDER`, `TILE_URL_TEMPLATE`, `TILE_ATTRIBUTION`, `TILE_MIN_ZOOM`, `TILE_MAX_ZOOM`.
2. **Attribution preserved** — every provider entry carries its required attribution; Leaflet renders it on the map.
3. **Rate-limit friendly** — `keepBuffer: 1`, `updateWhenIdle: true`, `updateWhenZooming: false`, `detectRetina: false`, no `{s}` cache-busting subdomains, no prefetching.
4. **Graceful error handling + fallback** — `tileerror` is counted; after `TILE_ERROR_THRESHOLD` (default 6) consecutive failures the app falls back to an offline canvas grid so campus overlays remain usable, and shows a "Base map unavailable" status with a Retry button.
5. **Provider switching UI** — a tile-provider selector lets an operator switch to `osm-de` (or another configured provider) when `osm-standard` is blocked, without redeploying.
6. **Config exposed via API** — `GET /api/v1/config/public` returns the public tile config (`defaultProvider`, `providers`, `errorThreshold`, `referrerPolicy`) so the frontend always matches server configuration.

## Recommended operator action
- **Development / localhost:** if `osm-standard` returns 403, open the map with `?tiles=osm-de` or select "OpenStreetMap Germany" in the provider selector, or set `TILE_PROVIDER=osm-de` in `.env`.
- **Production / map.lab:** obtain a dedicated tile provider (commercial OSM-derived tiles or self-hosted tiles) and configure `TILE_URL_TEMPLATE`/`TILE_ATTRIBUTION`/`TILE_PROVIDERS_JSON` per that provider's policy. Do not point production traffic at volunteer OSM servers.

## Files changed / involved
- `src/config/mapTiles.js` — provider registry, validation, public config serialization.
- `src/config/env.js` — builds tile config from env.
- `src/server.js` — `GET /api/v1/config/public` returns `tiles`.
- `public/pages/map.html` — tile layer construction, `tileerror`/`tileload` handling, offline fallback grid, provider selector UI, status/policy link.
- `src/db/migrations/0004_map_tiles.sql` — persists default `map.tile_url` setting.
- `src/modules/settings/service.js` — default settings include tile URL.
- `docs/TILE_403_ROOT_CAUSE.md` — this document.
- `docs/KNOWN_LIMITATIONS.md` — updated with tile notes.

## Verification checklist
- [ ] Map loads with visible OSM attribution.
- [ ] Selecting a different provider (`?tiles=osm-de` or dropdown) switches the base layer without reload.
- [ ] When all providers fail, the offline canvas grid shows and campus overlays/markers/live users remain visible.
- [ ] `GET /api/v1/config/public` returns both `osm-standard` and `osm-de` providers with attribution and policy URLs.
- [ ] No `{s}` subdomain token, no cache-busting query strings, no prefetch logic present.
