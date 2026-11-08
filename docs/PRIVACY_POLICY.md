# Privacy Policy (Project Draft)

This document describes privacy behavior implemented/planned for the IIUC Live Campus Map CSE-3634 project. It is a course-project draft, not legal advice.

## Data collected
- Account data: email, display name, role (student/teacher/admin), active status, password hash (bcrypt), timestamps.
- Campus/map data: campus locations, categories, user-created markers, provenance/verification metadata where provided.
- Live location data (opt-in): latitude, longitude, optional accuracy, recorded time, expiry, and sharing audience preference.

## Live location principles
- **Opt-in only.** Users must explicitly enable sharing; default is off.
- **Audience-limited.** Sharing can be limited (e.g., authenticated/students/teachers per implemented audiences). Server filters visibility and emits updates only to the selected audience room.
- **Latest point, not history.** The schema stores current live location per user (`live_locations` primary key on user). The service purges stale/expired rows and hides stale points.
- **User control.** Users can stop sharing; stop removes live point and broadcasts removal.
- **Expiry/staleness.** Server enforces expiry and stale cutoff. Expired/stale points are hidden and cleaned.

## Admin access
- Admin dashboard/stats use aggregate counts and do not expose raw GPS coordinates.
- Admin can manage users/campus/categories and review audit logs. Disabling an account removes live location data.
- Any future individual-location lookup must be separately authorized, audited, and policy-approved (not enabled as a general feature).

## Security controls
- Passwords are hashed with bcrypt; plaintext passwords are never stored.
- Session auth uses HTTP-only cookies; mutating API routes require `X-Requested-With: fetch` (CSRF guard).
- Rate limiting is applied to API and auth endpoints.
- Role checks are enforced server-side.

## Audit logging
Audit logs record administrative/security-relevant actions (actor, action, target, timestamp, limited details). They must not store passwords, session cookies, raw access tokens, or unnecessary raw GPS trails.

## Retention and deletion
- Live locations are removed when sharing stops, user is disabled, expired, or stale.
- Soft-deactivation is used for some records (campus/markers/categories) to preserve references; inactive records are hidden from normal views.
- Operational retention (logs/backups) should be configured by deployment policy.

## User responsibilities
- Do not share credentials.
- Only enable location sharing when you understand the selected audience and expiry.
- Report privacy/security concerns to the course/project administrator.
