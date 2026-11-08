# IIUC Live Campus Map — Detailed Functional Plan (Plan 2)

## 0. Global UI
- App shell (header/nav/sidebar/content/footer), role-aware nav, responsive, accessible, loading/success/error/empty states, online/offline + socket status, session-expiry redirect, CSRF on mutations.

## 1. Public pages
- `/` landing: logo, about, login, optional public map preview (no private GPS), privacy notice, footer.
- `/login`: email/password, rate limit, generic errors, redirect by role.
- `/register`: conditional; institutional email, role request student/teacher only, password confirm, terms consent, admin approval.

## 2. Student pages
- `/dashboard`: welcome, map preview (public data only), quick actions, sharing status, nearby POIs (opt-in GPS), recent own activity.
- `/map`: Leaflet OSM, verified campus extent, zoom/pan, layer switcher, search (name/alias/category/marker), category filters, building popups + detail, live users (authorized, not stale), own location (local even when OFF), legend, tile error state, mobile.
- `/live-location`: status (off/requesting/sharing/paused/expired/error), consent explanation, audience selector (campus/teachers/selected), start (browser permission + server consent), pause, resume, stop (delete + broadcast removal), accuracy display, last update/stale, socket connection state, expiry + renew, privacy link.
- `/profile`: edit display name, view email, read-only role, student id (policy), change password, account status, optional sessions, delete/deactivate request.
- `/settings`: sharing default OFF, default audience/duration, notifications (optional), privacy notice + retention, logout/revoke sessions.

## 3. Teacher pages
- `/teacher/dashboard`, `/teacher/map`, `/teacher/live-location`, profile/settings same as student; teacher-only filters/shortcuts by admin config; no automatic access to all student GPS.

## 4. Admin pages
- `/admin` dashboard: counts (users by status/role, campus verified/unverified, markers by category, sharing/paused/expired, socket clients, recent audit, system health) — aggregates only, no coords.
- `/admin/users`: paginated searchable/filterable (role/status/date), detail, create student/teacher, edit, change role (confirm, protect last admin), activate/deactivate (revoke sessions/sockets + remove GPS), password reset (no plaintext), soft delete, optional bulk.
- `/admin/campus`: list/search/filter (name/category/verification), add (name/category/point/source/verification), map picker, optional boundary editor (validate GeoJSON), edit, verification (source/verified_by/verified_at, verified vs unverified), deactivate (hide, keep refs), optional import/export.
- `/admin/markers`: list (title/category/creator/coords/date/status), search/filter, view on map, edit/deactivate with audit, moderation if reporting.
- `/admin/categories`: create (unique name/icon/colour), edit, prevent delete while referenced (reassign), order/visibility, validate icon/colour.
- `/admin/locations`: aggregate counts only by default; individual lookup requires separate permission + reason + audit; emergency access only if policy; export disabled by default.
- `/admin/logs`: search (actor/action/target/date range), record admin/security events, never log passwords/cookies/raw GPS/tokens, admin-audit permission, protected from edits.
- `/admin/settings`: app name, registration mode, map centre/bounds, default sharing expiry, stale timeout, max accuracy, feature flags, tile provider URL/attribution/bounds, log retention.
- `/admin/system-health`: API/DB/socket status, uptime, version, last backup.

## 5. Permission matrix
- Visitor: landing/login (register if enabled), public map preview only.
- Student/Teacher: map, search, profile, own sharing, markers if enabled, own marker edit.
- Admin: all management + audit (explicit monitoring permission for GPS). UI hides but server enforces.

## 6. Validation
- Email normalize/unique; password bcrypt; lat -90..90, lng -180..180, accuracy positive + max; audience enum campus/teachers/selected; expiry future UTC max duration; category/campus/marker title/description limits; GeoJSON valid Polygon/MultiPolygon (lng,lat) within bounds; server-generated timestamps.

## 7. Location lifecycle & edge cases
- Permission denied → no GPS record; unavailable → no fallback coords; low accuracy labeled; pause stops updates + hide/mark stale; stop → delete + broadcast removal; expiry server-side even if client connected; browser close → stale timeout/expiry; network drop → disconnected + stale; reconnect → reauth + fresh snapshot, no queued GPS replay; account disabled → revoke session/socket, stop sharing, delete location; DB write fail → no success broadcast; unauthorized viewer → no coordinate anywhere; multiple tabs → one record per user (last wins or lease).

## 8. Search/map/navigation
- Search by name/aliases (+category/description optional), debounced, clear button, loading, no-results; select result pans/zooms + popup; configurable bounds; boundaries only when verified GeoJSON; own location shown locally even OFF; routing optional separate.

## 9. Optional modules
- Notifications, campus notices, marker reports, emergency reports (only if real workflow).

## 10. Non-functional
- Performance (interactive promptly), realtime latency <2s local, modest Pi scale, supervised restart + health, HTTPS/WSS, secure sessions, CSRF, RBAC, object auth, rate limits, validation, audit, privacy opt-in/latest-only/expiry/stop, accessibility, compatibility, maintainability (modular/migrations/lint/tests), backup/recovery, observability (structured logs/health/non-sensitive errors), data integrity (FKs/constraints/transactions/server timestamps).

## 11. Error/status messages
- Invalid login, session expired, access denied, GPS permission denied, GPS unavailable, sharing off/paused, socket disconnected, map tiles unavailable, save failed, no results.

## 12. Test plan & acceptance
- Auth, authorization, map, markers, GPS, socket, privacy, admin, deployment, network evidence — must pass.

## 13. Build order & deliverables
- Phases 1-8 matching plan; deliverables: repo+setup, migrations+ER+data dict, page/role/permission + API docs, socket contract + privacy policy, verified campus dataset + provenance, deployment/network diagram + infra, test results + packet captures + demo, known limitations.

## 14. Open decisions (defaults)
- Admin-created/approval accounts; markers student/teacher submit + admin moderate (or admin-only); default campus opt-in audience; admin precise GPS off by default + audited; bounded sharing ~2h renewable; stale 60s; GPS cadence ≥3s; no history; routing not first release; controlled registration; OSM dev tiles; publish boundaries only after verification.

## 15. Implementation rule
- Vertical slices: UI → API/socket → permission → service → DB → response/event → tests. No buttons without backend. No fake GPS/users/stats. Seed data visibly marked test/demo.
