# Socket Contract

Socket.IO endpoint is the same origin as the HTTP server (default `http://localhost:3000`).

## Connection/auth
- Transport uses browser cookies; the Socket.IO handshake runs through Express session middleware.
- Unauthenticated connections are rejected (`UNAUTHORIZED`).
- On connect, server checks user is active; disabled users are disconnected and their live point is removed.
- Rooms:
  - `aud:all_authenticated` — all authenticated viewers.
  - `aud:students` — student audience room.
  - `aud:teachers` — teacher/admin audience room.
  - `admin` — admins.
  - `marker:<id>` — marker room (joined explicitly).

## Server -> client events
| Event | Payload | Audience/notes |
|---|---|---|
| `location:snapshot` | `items[]` | Sent to connecting socket; filtered by `listVisible(viewer)`. |
| `location:updated` | `{ userId, displayName, role, latitude, longitude, accuracy, recordedAt, expiresAt? }` | Emitted to `aud:<prefs.audience>` only. No broadcast when sharing off. |
| `location:removed` | `{ userId, reason? }` | Emitted globally for removal/stop/expiry/disable; clients remove marker for that user. |
| `marker:created` | marker item | Broadcast on REST create. |
| `marker:updated` | marker item | Broadcast on REST update. |
| `marker:deleted` | `{ id }` | Broadcast on REST delete. |

## Client -> server events (ack callback supported)
| Event | Payload | Ack/result | Notes |
|---|---|---|---|
| `snapshot:request` | - | `{ ok, items }` | Returns audience-filtered visible live points. |
| `location:status` | - | `{ ok, sharing, audience, location }` | Current user sharing state. |
| `location:update` | `{ latitude, longitude, accuracy? }` | `{ ok }` or `{ ok:false, error }` | Requires sharing enabled, active account, valid coords; server enforces prefs/expiry. |
| `location:pause` | - | `{ ok }` | Stops sharing and removes live point/broadcast removal. |
| `location:resume` | `{ audience?, expiresAt?, durationMinutes? }` | `{ ok }` | Re-enables sharing prefs; next GPS update publishes. |
| `location:stop` | - | `{ ok }` | Deletes live point and emits removal. |
| `marker:join` | `{ markerId }` | `{ ok }` | Validates marker exists; joins `marker:<id>`. |
| `marker:leave` | `{ markerId }` | `{ ok }` | Leaves marker room. |

## Privacy/authorization rules
- Never trust client-selected audience for delivery: updates are emitted to the persisted `prefs.audience` room after server-side checks.
- `listVisible` filters by viewer role, sharer audience, active account, stale cutoff, and expiry.
- Disabled accounts cannot maintain live sharing over sockets.
- Location payloads contain only live point fields needed for map display; no password/session/token data.
