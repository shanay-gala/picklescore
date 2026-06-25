"""PickleScore backend regression tests.

Covers: health, auth (admin & referee), public endpoints, admin/referee RBAC,
match lifecycle (create -> update players -> start -> score -> undo -> finish),
leaderboard accounting, referee admin CRUD, and WebSocket ping + match_changed
broadcast on scoring.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any

import pytest
import requests
from websocket import create_connection  # websocket-client

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
WS_URL = BASE.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"

ADMIN_EMAIL = "shanaygala@gmail.com"
ADMIN_PASSWORD = "admin123"
REF_PIN = "1234"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s: requests.Session) -> str:
    r = s.post(f"{API}/auth/admin/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def ref_token(s: requests.Session) -> str:
    r = s.post(f"{API}/auth/referee/login", json={"pin": REF_PIN})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Auth ----------
class TestAuth:
    def test_admin_login_ok(self, s):
        r = s.post(f"{API}/auth/admin/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "admin"
        assert "access_token" in body and len(body["access_token"]) > 20

    def test_admin_login_bad_password(self, s):
        r = s.post(f"{API}/auth/admin/login",
                   json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_referee_login_ok(self, s):
        r = s.post(f"{API}/auth/referee/login", json={"pin": REF_PIN})
        assert r.status_code == 200
        assert r.json()["role"] == "referee"

    def test_referee_login_bad_pin_digits(self, s):
        r = s.post(f"{API}/auth/referee/login", json={"pin": "9999"})
        assert r.status_code == 401

    def test_referee_login_non_digit_pin(self, s):
        r = s.post(f"{API}/auth/referee/login", json={"pin": "abcd"})
        assert r.status_code == 400

    def test_referee_login_short_pin(self, s):
        r = s.post(f"{API}/auth/referee/login", json={"pin": "12"})
        assert r.status_code == 400


# ---------- Public endpoints ----------
class TestPublic:
    def test_teams_seeded(self, s):
        r = s.get(f"{API}/teams")
        assert r.status_code == 200
        teams = r.json()
        assert len(teams) == 8, f"expected 8 teams, got {len(teams)}"
        for t in teams:
            assert "id" in t and "name" in t
            assert "players" in t
            assert len(t["players"]) == 6, f"team {t['name']} has {len(t['players'])} players"
            captains = [p for p in t["players"] if p.get("is_captain")]
            assert len(captains) == 1, f"team {t['name']} captain count={len(captains)}"

    def test_matches_list(self, s):
        r = s.get(f"{API}/matches")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_leaderboard_initial(self, s):
        r = s.get(f"{API}/leaderboard")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 8
        ranks = sorted(r["rank"] for r in rows)
        assert ranks == list(range(1, 9))
        for row in rows:
            assert "wins" in row and "tournament_points" in row


# ---------- RBAC ----------
class TestRBAC:
    def test_create_match_no_token_unauth(self, s):
        r = s.post(f"{API}/matches", json={"team_a_id": "x", "team_b_id": "y"})
        assert r.status_code in (401, 403)

    def test_create_team_referee_forbidden(self, s, ref_token):
        r = s.post(f"{API}/teams", headers=H(ref_token), json={"name": "TEST_X"})
        assert r.status_code == 403

    def test_create_match_referee_forbidden(self, s, ref_token):
        teams = s.get(f"{API}/teams").json()
        r = s.post(f"{API}/matches", headers=H(ref_token),
                   json={"team_a_id": teams[0]["id"], "team_b_id": teams[1]["id"]})
        assert r.status_code == 403


# ---------- Match lifecycle ----------
class TestMatchLifecycle:
    match_id: str | None = None

    def test_full_flow(self, s, admin_token, ref_token):
        teams = s.get(f"{API}/teams").json()
        ta, tb = teams[0], teams[1]

        # 1. Create
        r = s.post(f"{API}/matches", headers=H(admin_token),
                   json={"team_a_id": ta["id"], "team_b_id": tb["id"],
                         "court_number": 2, "target_score": 11})
        assert r.status_code == 200, r.text
        m = r.json()
        mid = m["id"]
        assert m["status"] == "upcoming"
        assert m["score_a"] == 0 and m["score_b"] == 0
        assert m["team_a_name"] == ta["name"]

        # 2. Update with player IDs (2 per team)
        a_pids = [p["id"] for p in ta["players"][:2]]
        b_pids = [p["id"] for p in tb["players"][:2]]
        r = s.put(f"{API}/matches/{mid}", headers=H(admin_token),
                  json={"team_a_player_ids": a_pids, "team_b_player_ids": b_pids})
        assert r.status_code == 200
        m2 = r.json()
        assert m2["team_a_player_ids"] == a_pids
        assert m2["team_b_player_ids"] == b_pids
        assert len(m2["team_a_players"]) == 2

        # 3. Start (referee allowed)
        r = s.post(f"{API}/matches/{mid}/start", headers=H(ref_token))
        assert r.status_code == 200
        assert r.json()["status"] == "live"

        # 4. Score: a x3, b x2
        for _ in range(3):
            r = s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                       headers=H(ref_token))
            assert r.status_code == 200
        for _ in range(2):
            r = s.post(f"{API}/matches/{mid}/score", params={"side": "b"},
                       headers=H(ref_token))
            assert r.status_code == 200
        cur = s.get(f"{API}/matches/{mid}").json()
        assert cur["score_a"] == 3 and cur["score_b"] == 2

        # 5. Bad side
        r = s.post(f"{API}/matches/{mid}/score", params={"side": "c"},
                   headers=H(ref_token))
        assert r.status_code == 400

        # 6. Undo (last point was 'b')
        r = s.post(f"{API}/matches/{mid}/undo", headers=H(ref_token))
        assert r.status_code == 200
        u = r.json()
        assert u["score_a"] == 3 and u["score_b"] == 1, f"after undo: {u['score_a']}/{u['score_b']}"

        # 7. Finish — make A win clearly
        for _ in range(8):
            s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                   headers=H(ref_token))
        # A: 11, B: 1
        r = s.post(f"{API}/matches/{mid}/finish", headers=H(ref_token))
        assert r.status_code == 200
        f = r.json()
        assert f["status"] == "completed"
        assert f["winner_team_id"] == ta["id"], f"winner={f.get('winner_team_id')}, a={ta['id']}"

        # 8. Leaderboard reflects the win
        lb = s.get(f"{API}/leaderboard").json()
        by_id = {row["team_id"]: row for row in lb}
        assert by_id[ta["id"]]["wins"] >= 1
        assert by_id[tb["id"]]["losses"] >= 1
        assert by_id[ta["id"]]["tournament_points"] >= 2

        TestMatchLifecycle.match_id = mid


# ---------- Referee admin ----------
class TestRefereeAdmin:
    def test_create_referee_and_login(self, s, admin_token):
        new_pin = "8642"
        r = s.post(f"{API}/referees", headers=H(admin_token),
                   json={"name": "TEST_Ref", "pin": new_pin})
        assert r.status_code == 200, r.text
        ref = r.json()
        assert ref["role"] == "referee"
        assert "pin_hash" not in ref

        # Login with new pin
        r = s.post(f"{API}/auth/referee/login", json={"pin": new_pin})
        assert r.status_code == 200
        assert r.json()["role"] == "referee"

        # Cleanup
        s.delete(f"{API}/referees/{ref['id']}", headers=H(admin_token))

    def test_invalid_pin_rejected(self, s, admin_token):
        r = s.post(f"{API}/referees", headers=H(admin_token),
                   json={"name": "TEST_Bad", "pin": "12a4"})
        assert r.status_code == 400


# ---------- WebSocket ----------
class TestWebSocket:
    def test_ping_and_broadcast(self, s, admin_token, ref_token):
        ws = create_connection(WS_URL, timeout=10)
        try:
            hello = json.loads(ws.recv())
            assert hello.get("type") == "hello"
            ws.send("ping")
            pong = json.loads(ws.recv())
            assert pong.get("type") == "pong"

            # Create a match -> expect match_changed broadcast
            teams = s.get(f"{API}/teams").json()
            r = s.post(f"{API}/matches", headers=H(admin_token),
                       json={"team_a_id": teams[2]["id"], "team_b_id": teams[3]["id"],
                             "court_number": 9})
            assert r.status_code == 200
            mid = r.json()["id"]

            # Read messages for up to 3s
            ws.settimeout(3)
            got_broadcast = False
            deadline = time.time() + 3
            while time.time() < deadline:
                try:
                    msg = json.loads(ws.recv())
                    if msg.get("type") == "match_changed":
                        got_broadcast = True
                        break
                except Exception:
                    break
            assert got_broadcast, "Did not receive match_changed broadcast"

            # Cleanup
            s.delete(f"{API}/matches/{mid}", headers=H(admin_token))
        finally:
            ws.close()
