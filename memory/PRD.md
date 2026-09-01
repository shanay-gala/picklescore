# Kurukshetra Picklewave — PRD

## Original problem statement
Mobile-first PWA for a live pickleball tournament: 12 teams (Season 2), 6 players each. Public live scoring with real-time WebSocket sync (no login), hidden referee PIN login for scoring, and admin PIN login for tournament setup (create/delete fixtures).

## Personas
- **Public viewer / player**: watches live scores, browses teams and standings; no login.
- **Referee** (PIN 4711 @ `/ref`): starts/pauses/scores/undoes matches; edits match target & score; assigns players. CANNOT create or delete fixtures.
- **Admin** (PIN 2580 @ `/admin`): full referee powers PLUS creating and deleting fixtures.

## Architecture
- **Backend**: FastAPI + Motor (async) + native WebSocket hub, PyJWT auth, bcrypt hashing.
- **Frontend**: React 19 + Tailwind + shadcn/ui + Sonner + Lucide + React Router.
- **DB**: MongoDB Atlas cluster `court-live-4` (shared preview + prod).
- Real-time: `/api/ws` broadcasts `{type: "fixture_changed" | "teams_changed"}` on every mutation.

## Auth model (2026-02-01)
- Admin and Referee are distinct roles with separate PIN endpoints:
  - `POST /api/auth/admin/pin-login` → role=admin
  - `POST /api/auth/referee/login`   → role=referee
- Fixture create/delete endpoints locked to `admin` role only (403 for referee).
- All other referee endpoints (start/score/undo/pause/finish/edit match) remain shared.
- Env vars: `REFEREE_DEFAULT_PIN=4711`, `ADMIN_DEFAULT_PIN=2580`. PIN hashes are refreshed on every backend startup so rotating the env value takes effect immediately.

## Implemented (2026-02-01, this session)
- Separate Admin PIN login flow (`/admin` route + AdminLogin page + `endpoints.adminLogin`).
- Backend endpoint `POST /api/auth/admin/pin-login` and admin `pin_hash` seeding.
- Locked `POST /api/fixtures` and `DELETE /api/fixtures/{id}` to `admin` role only.
- Referee dashboard hides Admin button when role !== admin.
- RefereeAdmin page redirects non-admins away (to `/admin` if unauthed, to `/referee` if referee).
- 401 interceptor now routes admin-panel expirations to `/admin?expired=1`.
- Rotated referee PIN 9832 → 4711.
- **Self-healing standings reconciliation on startup**: `reconcile_offline_standings()` in
  `server.py` computes per-team PF pre-Week-5 from match data and injects
  `bonus_points = target - PF_pre_week5` so leaderboard = offline_table + Week5_PF.
  Guarded by `RECONCILE_KEY` marker in `db.system_flags` — runs once per key value.
  Change the key value to re-run after a future edit to `OFFLINE_PRE_WEEK5_TARGETS`.

## Prior implemented (previous sessions)
- Season 2 migration (12 teams, 72 players), MongoDB Atlas cluster.
- `/api/admin/backup` + `/api/admin/restore` endpoints.
- Team detail redesign, Captain chip sizing, token TTL 30 days.
- Optimistic Start Match navigation + skeleton loaders.
- Direct edit of match target/score via EditMatchSheet.
- 1v1 and 2v2 support; 3-3-4-3 round layout.
- `PUT /api/players/{id}` partial updates.

## Known blockers / pending user input
- **Points reconciliation (P0, BLOCKED)**: User wants offline point table (before Week 5) to override app standings. Waiting on the user to type out per-team PTS since the image was stripped from history.

## Prioritized backlog
- P1: `PUT /api/teams/{id}` partial update.
- P1: Audit log collection for fixture create/update/delete.
- P2: `PUT /api/matches/{id}` auto flip `winner_team_id` on crossover edit.
- P2: `POST /api/admin/restore` add safe `merge` mode.
- P2: Player validation hardening (reject empty names / bad team_id / arbitrary category).
- P2: CSV/PDF export of final standings.
- P2: PWA manifest.json + service worker.

## Files map (frontend)
- `src/App.js` — router (adds `/admin`)
- `src/pages/AdminLogin.js` — new admin PIN pad
- `src/pages/RefLogin.js` — referee PIN pad
- `src/pages/RefereeDashboard.js` — admin button gated by role
- `src/pages/RefereeAdmin.js` — admin-only guard
- `src/lib/api.js` — `endpoints.adminLogin`, 401 interceptor routing

## Files map (backend)
- `server.py`:
  - Auth: `admin_pin_login` at `/api/auth/admin/pin-login`
  - Seed: refreshes admin & referee `pin_hash` on startup
  - Fixture routes: `require_role("admin")` on create + delete
