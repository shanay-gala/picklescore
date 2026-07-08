# Kurukshetra Picklewave — PRD

## Original problem statement
Rebuild the "PickleScore" tournament backend (provided as-is by the user) into a React web app for a live-scoring pickleball tournament. Move hardcoded JWT_SECRET / ADMIN_EMAIL / REFEREE_PIN to environment variables. Support 8 teams, 2v2 matches, fixtures with 4 rounds × 3 matches, real-time WebSocket sync, hidden `/ref` PIN login for referees, one-handed mobile scoring UI, and a leaderboard sorted by total tournament points.

## Personas
- **Public viewer / player**: watches live scores, browses teams and standings; no login.
- **Referee**: enters PIN at `/ref`, controls fixtures/rounds/matches, updates scores.
- **Admin** (superset of referee): creates and deletes fixtures.

## Architecture
- **Backend**: FastAPI + Motor (async) + native WebSocket hub, PyJWT auth, bcrypt hashing.
- **Frontend**: React 19 + Tailwind + shadcn/ui + Sonner + Lucide + React Router v7.
- **DB**: MongoDB (currently pointed at user's Atlas cluster `court-live-4`, DB name `court-live-4-test_database`).
- Real-time: `/api/ws` broadcasts `{type: "fixture_changed" | "teams_changed"}` on every mutation. Front-end auto-reloads via the `useLive` hook.

## Secrets (moved from hardcoded to env)
- `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_DEFAULT_PASSWORD`, `REFEREE_DEFAULT_PIN` — all read from `backend/.env`.

## Implemented (2026-02)
- Full backend from provided blueprint (all routes, seeding, WS, cascade auto-complete, leaderboard).
- React web app:
  - Public routes: `/` (Games), `/teams`, `/standings`, `/fixture/:id`.
  - Sticky bottom tab bar with data-testids.
  - Hidden `/ref` PIN pad login.
  - Referee routes: `/referee` (dashboard), `/referee/admin`, `/referee/fixture/:id` (round & match control + player assignment sheet), `/referee/match/:id` (one-handed giant tap targets, undo/pause/finish, live rail).
  - Dark obsidian default + emerald-green light theme (Barlow Condensed + DM Sans fonts).
  - Real-time sync via `useLive` hook.
- Design guidelines followed (no purple/violet, no Inter/Roboto, high-contrast score numbers).
- `test_credentials.md` updated: admin `shanaygala@gmail.com / admin123`, referee PIN `9832`.

## Known blocker
- Atlas cluster `court-live-4` is not currently reachable from the container (TCP timeout on :27017). Fix: whitelist container egress IP `104.198.214.223` (or `0.0.0.0/0` for dev) in Atlas Network Access. Once fixed, backend seeds all 8 teams automatically on startup.

## Prioritized backlog
- P1: PWA manifest + service worker for "Add to Home Screen".
- P2: CSV export of final standings.
- P2: Admin screen to edit baseline points mid-tournament.
- P2: Referee re-authentication timeout / activity indicator.

## Files map (frontend)
- `src/App.js` — router
- `src/pages/GamesPage.js`, `TeamsPage.js`, `StandingsPage.js`, `FixtureDetail.js`, `RefLogin.js`, `RefereeDashboard.js`, `RefereeAdmin.js`, `RefereeFixture.js`, `RefereeMatch.js`
- `src/components/AppHeader.js`, `BottomNav.js`, `FixtureCard.js`, `StatusBadge.js`, `ThemeToggle.js`
- `src/lib/api.js`, `useLive.js`, `format.js`
