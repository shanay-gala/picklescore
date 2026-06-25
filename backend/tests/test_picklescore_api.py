"""PickleScore backend regression tests — iteration 2.

Verifies new auth changes:
  * Referee PIN is now 9832 (1234 must be rejected).
  * Referee role has admin-equivalent permissions on every previously
    admin-only endpoint (fixtures, teams, players, referees, matches).
"""
from __future__ import annotations

import json
import os
import time

import pytest
import requests
from websocket import create_connection  # websocket-client

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
WS_URL = BASE.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"

ADMIN_EMAIL = "shanaygala@gmail.com"
ADMIN_PASSWORD = "admin123"
REF_PIN = "9832"
OLD_REF_PIN = "1234"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s) -> str:
    r = s.post(f"{API}/auth/admin/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def ref_token(s) -> str:
    r = s.post(f"{API}/auth/referee/login", json={"pin": REF_PIN})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(token: str):
    return {"Authorization": f"Bearer {token}"}


# ---------- 1. Health ----------
def test_health(s):
    r = s.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- 2. Auth ----------
class TestAuth:
    def test_referee_login_new_pin_ok(self, ref_token):
        assert isinstance(ref_token, str) and len(ref_token) > 20

    def test_referee_login_old_pin_rejected(self, s):
        r = s.post(f"{API}/auth/referee/login", json={"pin": OLD_REF_PIN})
        assert r.status_code == 401, f"Old PIN 1234 should be rejected but got {r.status_code}: {r.text}"

    def test_referee_login_bad_pin(self, s):
        r = s.post(f"{API}/auth/referee/login", json={"pin": "0000"})
        assert r.status_code == 401

    def test_admin_login_still_works(self, admin_token):
        # Legacy endpoint kept for backward compat.
        assert isinstance(admin_token, str) and len(admin_token) > 20


# ---------- 3. Referee has admin-equivalent permissions ----------
class TestRefereeAdminEquivalence:
    """All previously admin-only endpoints must return 200 (not 403) with a referee JWT."""

    def test_referee_can_create_team_and_delete(self, s, ref_token):
        r = s.post(f"{API}/teams", headers=H(ref_token),
                   json={"name": "TEST_RefTeam", "players": []})
        assert r.status_code == 200, f"POST /teams as referee: {r.status_code} {r.text}"
        tid = r.json()["id"]
        try:
            # Verify via list (no GET-by-id endpoint exposed)
            lst = s.get(f"{API}/teams").json()
            assert any(t["id"] == tid and t["name"] == "TEST_RefTeam" for t in lst)
        finally:
            # DELETE
            d = s.delete(f"{API}/teams/{tid}", headers=H(ref_token))
            assert d.status_code == 200, f"DELETE /teams as referee: {d.status_code} {d.text}"
        # Confirm gone from list
        lst2 = s.get(f"{API}/teams").json()
        assert not any(t["id"] == tid for t in lst2)

    def test_referee_can_create_referee_and_delete(self, s, ref_token):
        r = s.post(f"{API}/referees", headers=H(ref_token),
                   json={"name": "TEST_RefByRef", "pin": "7531"})
        assert r.status_code == 200, f"POST /referees as referee: {r.status_code} {r.text}"
        rid = r.json()["id"]
        # And referee list
        lst = s.get(f"{API}/referees", headers=H(ref_token))
        assert lst.status_code == 200
        # Login as new referee
        nl = s.post(f"{API}/auth/referee/login", json={"pin": "7531"})
        assert nl.status_code == 200
        # Delete
        d = s.delete(f"{API}/referees/{rid}", headers=H(ref_token))
        assert d.status_code == 200, f"DELETE /referees as referee: {d.status_code} {d.text}"

    def test_referee_can_create_fixture_and_match_update(self, s, ref_token):
        teams = s.get(f"{API}/teams").json()
        ta, tb = teams[0], teams[1]
        r = s.post(f"{API}/fixtures", headers=H(ref_token),
                   json={"team_a_id": ta["id"], "team_b_id": tb["id"],
                         "court_number": 11, "target_score": 11})
        assert r.status_code == 200, f"POST /fixtures as referee: {r.status_code} {r.text}"
        f = r.json()
        fid = f["id"]
        try:
            detail = s.get(f"{API}/fixtures/{fid}").json()
            mid = detail["rounds"][0]["matches"][0]["id"]
            # PUT /matches/{id} as referee
            a_pids = [p["id"] for p in ta["players"][:2]]
            b_pids = [p["id"] for p in tb["players"][:2]]
            u = s.put(f"{API}/matches/{mid}", headers=H(ref_token),
                      json={"team_a_player_ids": a_pids,
                            "team_b_player_ids": b_pids})
            assert u.status_code == 200, f"PUT /matches as referee: {u.status_code} {u.text}"
        finally:
            d = s.delete(f"{API}/fixtures/{fid}", headers=H(ref_token))
            assert d.status_code == 200, f"DELETE /fixtures as referee: {d.status_code} {d.text}"


# ---------- 4. Teams seeded ----------
def test_teams_seeded(s):
    r = s.get(f"{API}/teams")
    assert r.status_code == 200
    teams = [t for t in r.json() if not t["name"].startswith("TEST_")]
    assert len(teams) == 8
    for t in teams:
        assert len(t["players"]) == 6


# ---------- helpers ----------
def _create_fixture(s, token, court=1):
    teams = s.get(f"{API}/teams").json()
    ta, tb = teams[0], teams[1]
    r = s.post(f"{API}/fixtures", headers=H(token),
               json={"team_a_id": ta["id"], "team_b_id": tb["id"],
                     "court_number": court, "target_score": 11})
    assert r.status_code == 200, r.text
    return r.json(), ta, tb


# ---------- 5. Happy path with referee token only ----------
class TestHappyPath:
    def test_happy_path_referee_only(self, s, ref_token):
        f, ta, tb = _create_fixture(s, ref_token, court=12)
        fid = f["id"]
        try:
            r = s.post(f"{API}/fixtures/{fid}/start", headers=H(ref_token))
            assert r.status_code == 200
            r = s.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=H(ref_token))
            assert r.status_code == 200
            detail = s.get(f"{API}/fixtures/{fid}").json()
            mid = detail["rounds"][0]["matches"][0]["id"]
            a_pids = [p["id"] for p in ta["players"][:2]]
            b_pids = [p["id"] for p in tb["players"][:2]]
            r = s.put(f"{API}/matches/{mid}", headers=H(ref_token),
                      json={"team_a_player_ids": a_pids,
                            "team_b_player_ids": b_pids})
            assert r.status_code == 200
            r = s.post(f"{API}/matches/{mid}/start", headers=H(ref_token))
            assert r.status_code == 200
            # score
            for _ in range(3):
                assert s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                              headers=H(ref_token)).status_code == 200
            # pause
            r = s.post(f"{API}/matches/{mid}/pause", headers=H(ref_token))
            assert r.status_code == 200 and r.json()["status"] == "paused"
            # resume
            r = s.post(f"{API}/matches/{mid}/resume", headers=H(ref_token))
            assert r.status_code == 200 and r.json()["status"] == "live"
            # finish
            r = s.post(f"{API}/matches/{mid}/finish", headers=H(ref_token))
            assert r.status_code == 200
            assert r.json()["status"] == "completed"
        finally:
            s.delete(f"{API}/fixtures/{fid}", headers=H(ref_token))


# ---------- 6. WebSocket ----------
class TestWS:
    def test_ws_hello_pong_and_broadcast(self, s, ref_token):
        ws = create_connection(WS_URL, timeout=10)
        try:
            hello = json.loads(ws.recv())
            assert hello.get("type") == "hello"
            ws.send("ping")
            pong = json.loads(ws.recv())
            assert pong.get("type") == "pong"

            f, _, _ = _create_fixture(s, ref_token, court=13)
            fid = f["id"]
            try:
                ws.settimeout(3)
                got = False
                deadline = time.time() + 3
                while time.time() < deadline:
                    try:
                        msg = json.loads(ws.recv())
                        if msg.get("type") == "fixture_changed":
                            got = True
                            break
                    except Exception:
                        break
                assert got, "no fixture_changed broadcast received"
            finally:
                s.delete(f"{API}/fixtures/{fid}", headers=H(ref_token))
        finally:
            ws.close()
