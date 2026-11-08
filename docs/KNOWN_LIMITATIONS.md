# Known Limitations

Current implementation status is a functional scaffold with partial PLAN2 coverage.

## Product / PLAN2 gaps
- Some PLAN2 UI pages exist as static files but are not fully wired to role-aware workflows (dashboard/profile/settings/live-location flows are partial).
- Registration is immediate active account creation in current implementation; PLAN2 discusses approval workflows in places — approval/verification workflow is not fully implemented.
- "Selected audience" sharing exists conceptually in plan, but backend audience model currently supports coarse audiences (`none/students/teachers/all_authenticated`); per-user selection is not implemented.
- Advanced admin map picker, boundary GeoJSON editor, import/export, reports/notifications, and emergency modules are not implemented.
- Public map preview without private GPS is not fully separated as a dedicated visitor-safe data path.

## Security / operations
- CSRF protection is minimal (`X-Requested-With` on mutating API routes) and session-based; production should review SameSite/CSRF strategy, HTTPS, CSP, and origin policy.
- Audit coverage is present for key admin/campus/marker/category actions but not exhaustive for every sensitive event.
- No production migration framework beyond baseline schema apply/seed; schema evolution needs managed migrations.
- `backend/src/` legacy scaffold remains in repo and can confuse maintenance; runtime should be standardized on `src/`.

## Data / realtime
- SQLite is suitable for local/course deployment, not high-concurrency production.
- Live location uses one latest row per user; good for privacy/latest-only but not for movement history (intentional).
- Socket reconnect/re-auth behavior depends on session state; queued offline GPS replay is intentionally not implemented.
- Geospatial boundary validation (GeoJSON) utilities exist in validation code but are not fully exposed as end-to-end admin features.

## Testing
- `tests/run.js` provides basic API/service/socket-contract checks using isolated temp DB. It is not a full integration/browser/device GPS/network-capture suite required by PLAN2 acceptance.
- Browser permission UX, Leaflet rendering, mobile behavior, packet captures, and deployment/network diagram evidence are manual/external deliverables not automated here.

## Base map / tiles
- The default `osm-standard` tile server (`tile.openstreetmap.org`) may return HTTP 403 "Access blocked" under OSM's tile usage policy (missing/blocked Referer, rate limiting, or blocked IP). The app mitigates this with a configurable provider registry, per-provider attribution, error-threshold handling, an offline canvas fallback, and a provider selector UI.
- If `osm-standard` is blocked, switch to `osm-de` via `?tiles=osm-de`, the provider selector dropdown, or `TILE_PROVIDER=osm-de` in `.env`. For production (`map.lab`), configure a dedicated tile provider via `TILE_PROVIDER`/`TILE_URL_TEMPLATE`/`TILE_PROVIDERS_JSON` per that provider's policy; do not point production traffic at volunteer OSM servers.
- Tiles are never bulk-downloaded, prefetched, or cached beyond normal browser behavior; attribution is always visible.

