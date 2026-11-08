# API Documentation

Base URL: `http://<host>:<port>/api/v1` (default local `http://localhost:3000/api/v1`).

## Conventions
- Auth: session cookie `connect.sid` (HTTP-only).
- Mutations: include `X-Requested-With: fetch`. JSON bodies use `Content-Type: application/json`.
- Success: `{ "ok": true, "data": ... }`.
- Failure: `{ "ok": false, "error": { "code": "...", "message": "..." } }`.
- Common codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `VALIDATION` (400), `NOT_FOUND` (404), `CONFLICT` (409), `CSRF` (403), `RATE_LIMITED` (429).

## Public / utility
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | no | Service health/time. |
| GET | `/config/public` | no | App name, registration flag, public feature hints. |

## Auth
| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | no | `{ email, password, displayName, role?, termsAccepted, studentId? }` | `role` allowed: `student`/`teacher`. Requires `REGISTRATION_ENABLED=1` and terms consent. Creates active session. |
| POST | `/auth/login` | no | `{ email, password }` | Generic invalid-credentials response. |
| POST | `/auth/logout` | yes | - | Destroys session. |
| GET | `/auth/me` | yes | - | Current session user: `id,email,display_name,role,is_active`. |

## Campus / map
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/campus` | yes | List active campus locations. Query: `q`, `categoryId`, `verifiedOnly`, `limit`, `offset`. |
| POST | `/campus` | admin | Create campus location: `name, latitude, longitude, description?, categoryId?, source?, verifiedAt?, isVerified?, isActive?`. Audited. |
| PATCH | `/campus/:id` | admin | Update fields. Audited. |
| DELETE | `/campus/:id` | admin | Soft-deactivates (`is_active=0`). Audited. |

## Categories
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/categories` | yes | Query `kind=campus|marker`. Returns active categories. |
| POST | `/categories` | admin | `{ name, kind }`. |

## Markers
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/markers` | yes | Query: `q`, `categoryId`, `owner`, `limit`, `offset`. |
| POST | `/markers` | yes | `{ title, latitude, longitude, description?, categoryId? }`. Owner set to current user. Emits `marker:created`. |
| PATCH | `/markers/:id` | owner/admin | Partial update. Emits `marker:updated`. |
| DELETE | `/markers/:id` | owner/admin | Soft-deactivates. Emits `marker:deleted`. |

## Live location / GPS
| Method | Path | Auth | Body/notes |
|---|---|---|---|
| GET | `/location/prefs` | yes | Current sharing preferences. |
| POST | `/location/prefs` | yes | `{ isSharing, audience, expiresAt?|durationMinutes? }`. Audiences: `none, students, teachers, all_authenticated`. Stopping sharing clears live point. |
| GET | `/location/status` | yes | Prefs + non-stale latest point. |
| POST | `/location/update` | yes | `{ latitude, longitude, accuracy? }`. Requires sharing enabled and not expired; validates coordinates. Emits audience-filtered `location:updated`. |
| POST | `/location/stop` | yes | Stops sharing, deletes live point, emits `location:removed`. |
| GET | `/location/visible` | yes | Live points visible to current viewer based on audience, active user, non-stale, non-expired. |

## Admin (role = admin)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Aggregate counts (users/campus/markers/sharing/live/audit/categories). No GPS coordinates. |
| GET | `/admin/users` | Query `q, role, active, limit, offset`. |
| GET | `/admin/users/:id` | User detail. |
| PATCH | `/admin/users/:id` | `{ role }` or `{ isActive }`. Cannot disable/demote own admin account (guarded). Disabling removes live location and is audited. |
| GET/POST/PATCH/DELETE | `/admin/campus` | Admin campus management (includes inactive via query where supported). |
| GET/POST/PATCH/DELETE | `/admin/categories` | Category management. |
| GET | `/admin/audit` | Audit log list. Query `limit, offset, actorUserId, action, targetType, q`. |
| GET | `/audit` | Same admin-audited log surface (admin only). |

## Validation highlights
- Coordinates: latitude `[-90,90]`, longitude `[-180,180]`.
- Email normalized/lowercased; password min length enforced in auth service (8+).
- Live updates require explicit sharing prefs; stale/expired points hidden/purged.
- Admin actions affecting users/campus/categories are written to `audit_logs` (no passwords/cookies/raw GPS tokens).
