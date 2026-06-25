# PickleScore — Pickleball Tournament Live Scoring

## Overview
Mobile-first React Native (Expo) + FastAPI + MongoDB app for live pickleball tournament scoring. 8 teams seeded from supplied roster. Real-time score sync via WebSocket. Public spectator view (no login). Admin web/email auth. Referee 4-digit PIN auth.

## Tech
- **Frontend**: Expo Router (SDK 54), React Native 0.81, dark/light/system theme, WebSocket live sync, expo-haptics on scoring tap.
- **Backend**: FastAPI + Motor (MongoDB), bcrypt-hashed creds, JWT (HS256). WebSocket at `/api/ws` broadcasts `match_changed` events.
- **Branding**: Volt-green (#D4FF00) on dark-first utility surface.

## Auth
- Admin: `shanaygala@gmail.com` / `admin123` (seeded).
- Referee: PIN `1234` (seeded). Admin can create more.

## Key Screens
- `/` — Public live dashboard with tabs: Live | Upcoming | Results | Standings.
- `/match/[id]` — Public match detail.
- `/login` — Admin email/password OR Referee PIN keypad.
- `/admin` — Admin home: Matches CRUD + Teams roster + Referees mgmt.
- `/referee` — Referee match list.
- `/referee/match/[id]` — HERO scoring: massive +1 tap zones, undo, finish.

## Backend Routes (all `/api`)
- Auth: `POST /auth/admin/login`, `POST /auth/referee/login`, `GET /auth/me`
- Teams: `GET/POST/PUT/DELETE /teams`
- Players: `GET/POST/PUT/DELETE /players`
- Matches: `GET/POST/PUT/DELETE /matches`, `POST /matches/{id}/start|score?side=a|b|undo|finish`
- Leaderboard: `GET /leaderboard` (sorted by tournament_points, wins, points_diff)
- Referees admin: `GET/POST/DELETE /referees`
- Real-time: `WS /ws`

## Real-Time
WebSocket pushes `{"type":"match_changed", "match_id":"..."}` after every score/undo/finish/create/edit, plus `{"type":"teams_changed"}`. Frontend `useLive` hook auto-reconnects with exponential backoff.

## Data
8 teams seeded from organizer's roster image:
SAMEER, KIRAN, HETANKSH, URVIL, SIDDHARTH, PRATIK, HEET, HEMIL — each with 6 players (captain marked).

## Smart Enhancement
**Live "Standings" auto-update** — leaderboard recomputes on every finished match without any admin action, sorted by tournament points → wins → point diff, with top-3 ranks highlighted in volt green. Combined with WebSocket push, spectator's phone updates in real-time during the event = built-in engagement.
