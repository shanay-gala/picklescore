"""PickleScore Fixture-based backend regression tests.

Covers the new Fixture hierarchy:
  Fixture (12 matches = 4 rounds x 3 matches) with explicit lifecycle guards,
  match start/score/pause/resume/undo/finish, leaderboard, referees, WebSocket.
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
REF_PIN = "1234"


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
    def test_admin_login_ok(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_admin_login_bad(self, s):
        r = s.post(f"{API}/auth/admin/login",
                   json={"email": ADMIN_EMAIL, "password": "nope"})
        assert r.status_code == 401

    def test_ref_login_ok(self, ref_token):
        assert isinstance(ref_token, str) and len(ref_token) > 20


# ---------- 3. Teams seeded ----------
def test_teams_seeded(s):
    r = s.get(f"{API}/teams")
    assert r.status_code == 200
    teams = r.json()
    assert len(teams) == 8
    for t in teams:
        assert len(t["players"]) == 6


# ---------- helpers ----------
def _create_fixture(s, admin_token, court=1):
    teams = s.get(f"{API}/teams").json()
    ta, tb = teams[0], teams[1]
    r = s.post(f"{API}/fixtures", headers=H(admin_token),
               json={"team_a_id": ta["id"], "team_b_id": tb["id"],
                     "court_number": court, "target_score": 11})
    assert r.status_code == 200, r.text
    return r.json(), ta, tb


# ---------- 4. Fixture creation ----------
class TestFixtureCreate:
    def test_create_fixture_with_12_matches(self, s, admin_token):
        f, ta, tb = _create_fixture(s, admin_token, court=5)
        try:
            assert f["status"] == "scheduled"
            assert f["matches_total"] == 12
            # Detail endpoint must return rounds with matches
            detail = s.get(f"{API}/fixtures/{f['id']}").json()
            assert len(detail["rounds"]) == 4
            for r in detail["rounds"]:
                assert r["status"] == "scheduled"
                assert len(r["matches"]) == 3
                for m in r["matches"]:
                    assert m["status"] == "scheduled"
                    assert m["score_a"] == 0 and m["score_b"] == 0
        finally:
            s.delete(f"{API}/fixtures/{f['id']}", headers=H(admin_token))


# ---------- 5/6. Lifecycle guards ----------
class TestLifecycleGuards:
    def test_all_guards(self, s, admin_token):
        f, ta, tb = _create_fixture(s, admin_token, court=6)
        fid = f["id"]
        try:
            detail = s.get(f"{API}/fixtures/{fid}").json()
            first_match = detail["rounds"][0]["matches"][0]
            second_match = detail["rounds"][0]["matches"][1]
            mid = first_match["id"]
            mid2 = second_match["id"]

            # Guard A: cannot start match while fixture scheduled
            r = s.post(f"{API}/matches/{mid}/start", headers=H(admin_token))
            assert r.status_code == 400, r.text
            assert "fixture" in r.json()["detail"].lower()

            # Start fixture
            r = s.post(f"{API}/fixtures/{fid}/start", headers=H(admin_token))
            assert r.status_code == 200
            assert r.json()["status"] == "live"

            # Guard B: cannot start match while round scheduled
            r = s.post(f"{API}/matches/{mid}/start", headers=H(admin_token))
            assert r.status_code == 400
            assert "round" in r.json()["detail"].lower()

            # Start round 1
            r = s.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=H(admin_token))
            assert r.status_code == 200

            # Guard C: cannot start without players
            r = s.post(f"{API}/matches/{mid}/start", headers=H(admin_token))
            assert r.status_code == 400
            assert "player" in r.json()["detail"].lower()

            # Assign players to both matches
            a_pids = [p["id"] for p in ta["players"][:2]]
            b_pids = [p["id"] for p in tb["players"][:2]]
            for m in (mid, mid2):
                rr = s.put(f"{API}/matches/{m}", headers=H(admin_token),
                           json={"team_a_player_ids": a_pids,
                                 "team_b_player_ids": b_pids})
                assert rr.status_code == 200

            # Start first match
            r = s.post(f"{API}/matches/{mid}/start", headers=H(admin_token))
            assert r.status_code == 200
            assert r.json()["status"] == "live"

            # Guard E: can't start a second match while another live
            r = s.post(f"{API}/matches/{mid2}/start", headers=H(admin_token))
            assert r.status_code == 400
            assert "already live" in r.json()["detail"].lower()

            # Guard G: complete fixture while pending
            r = s.post(f"{API}/fixtures/{fid}/complete", headers=H(admin_token))
            assert r.status_code == 400

            # Guard F: complete round 1 while matches not all completed
            r = s.post(f"{API}/fixtures/{fid}/rounds/1/complete", headers=H(admin_token))
            assert r.status_code == 400
            assert "pending" in r.json()["detail"].lower()

            # Score the live match
            r = s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                       headers=H(admin_token))
            assert r.status_code == 200
            # Pause it
            r = s.post(f"{API}/matches/{mid}/pause", headers=H(admin_token))
            assert r.status_code == 200
            assert r.json()["status"] == "paused"
            # Guard D: cannot score paused
            r = s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                       headers=H(admin_token))
            assert r.status_code == 400
            assert "live" in r.json()["detail"].lower()
            # Guard D-2: cannot score scheduled match (mid2)
            r = s.post(f"{API}/matches/{mid2}/score", params={"side": "a"},
                       headers=H(admin_token))
            assert r.status_code == 400
        finally:
            s.delete(f"{API}/fixtures/{fid}", headers=H(admin_token))


# ---------- 7. Happy path ----------
class TestHappyPath:
    def test_happy_path(self, s, admin_token, ref_token):
        f, ta, tb = _create_fixture(s, admin_token, court=7)
        fid = f["id"]
        try:
            # start fixture
            r = s.post(f"{API}/fixtures/{fid}/start", headers=H(admin_token))
            assert r.status_code == 200
            assert r.json()["status"] == "live"

            # start round 1
            r = s.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=H(admin_token))
            assert r.status_code == 200
            assert r.json()["rounds"][0]["status"] == "live"

            detail = s.get(f"{API}/fixtures/{fid}").json()
            m = detail["rounds"][0]["matches"][0]
            mid = m["id"]

            # assign players
            a_pids = [p["id"] for p in ta["players"][:2]]
            b_pids = [p["id"] for p in tb["players"][:2]]
            r = s.put(f"{API}/matches/{mid}", headers=H(admin_token),
                      json={"team_a_player_ids": a_pids,
                            "team_b_player_ids": b_pids})
            assert r.status_code == 200

            # start match (referee allowed)
            r = s.post(f"{API}/matches/{mid}/start", headers=H(ref_token))
            assert r.status_code == 200
            assert r.json()["status"] == "live"

            # score: a x3, b x2
            for _ in range(3):
                assert s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                              headers=H(ref_token)).status_code == 200
            for _ in range(2):
                assert s.post(f"{API}/matches/{mid}/score", params={"side": "b"},
                              headers=H(ref_token)).status_code == 200
            cur = s.get(f"{API}/matches/{mid}").json()
            assert cur["score_a"] == 3 and cur["score_b"] == 2

            # pause
            r = s.post(f"{API}/matches/{mid}/pause", headers=H(ref_token))
            assert r.status_code == 200 and r.json()["status"] == "paused"
            r = s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                       headers=H(ref_token))
            assert r.status_code == 400

            # resume
            r = s.post(f"{API}/matches/{mid}/resume", headers=H(ref_token))
            assert r.status_code == 200 and r.json()["status"] == "live"

            # undo (last was 'b')
            r = s.post(f"{API}/matches/{mid}/undo", headers=H(ref_token))
            assert r.status_code == 200
            u = r.json()
            assert u["score_a"] == 3 and u["score_b"] == 1

            # finish
            r = s.post(f"{API}/matches/{mid}/finish", headers=H(ref_token))
            assert r.status_code == 200
            fin = r.json()
            assert fin["status"] == "completed"
            assert fin["winner_team_id"] == ta["id"]
        finally:
            s.delete(f"{API}/fixtures/{fid}", headers=H(admin_token))


# ---------- 8. Leaderboard ----------
class TestLeaderboard:
    def test_points_aggregation_and_sorting(self, s, admin_token, ref_token):
        f, ta, tb = _create_fixture(s, admin_token, court=8)
        fid = f["id"]
        try:
            # start everything
            s.post(f"{API}/fixtures/{fid}/start", headers=H(admin_token))
            s.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=H(admin_token))
            detail = s.get(f"{API}/fixtures/{fid}").json()
            m = detail["rounds"][0]["matches"][0]
            mid = m["id"]
            s.put(f"{API}/matches/{mid}", headers=H(admin_token),
                  json={"team_a_player_ids": [p["id"] for p in ta["players"][:2]],
                        "team_b_player_ids": [p["id"] for p in tb["players"][:2]]})
            s.post(f"{API}/matches/{mid}/start", headers=H(ref_token))
            for _ in range(4):
                s.post(f"{API}/matches/{mid}/score", params={"side": "a"},
                       headers=H(ref_token))
            for _ in range(2):
                s.post(f"{API}/matches/{mid}/score", params={"side": "b"},
                       headers=H(ref_token))

            lb = s.get(f"{API}/leaderboard").json()
            assert len(lb) == 8
            by_id = {r["team_id"]: r for r in lb}
            # Points-based even for in-progress matches
            assert by_id[ta["id"]]["tournament_points"] >= 4
            assert by_id[tb["id"]]["tournament_points"] >= 2
            # Sort key (-tp, -pd, -fw, name)
            for prev, nxt in zip(lb, lb[1:]):
                pk = (-prev["tournament_points"], -prev["points_diff"],
                      -prev["fixture_wins"], prev["team_name"])
                nk = (-nxt["tournament_points"], -nxt["points_diff"],
                      -nxt["fixture_wins"], nxt["team_name"])
                assert pk <= nk
        finally:
            s.delete(f"{API}/fixtures/{fid}", headers=H(admin_token))


# ---------- 9. Referees admin endpoints ----------
class TestReferees:
    def test_referee_crud(self, s, admin_token, ref_token):
        # admin can list
        r = s.get(f"{API}/referees", headers=H(admin_token))
        assert r.status_code == 200
        # referee cannot list
        r = s.get(f"{API}/referees", headers=H(ref_token))
        assert r.status_code == 403

        # create + login + delete
        r = s.post(f"{API}/referees", headers=H(admin_token),
                   json={"name": "TEST_Ref2", "pin": "8642"})
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            r = s.post(f"{API}/auth/referee/login", json={"pin": "8642"})
            assert r.status_code == 200
        finally:
            s.delete(f"{API}/referees/{rid}", headers=H(admin_token))


# ---------- 10. WebSocket ----------
class TestWS:
    def test_ws_hello_pong_and_broadcast(self, s, admin_token):
        ws = create_connection(WS_URL, timeout=10)
        try:
            hello = json.loads(ws.recv())
            assert hello.get("type") == "hello"
            ws.send("ping")
            pong = json.loads(ws.recv())
            assert pong.get("type") == "pong"

            f, _, _ = _create_fixture(s, admin_token, court=9)
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
                s.delete(f"{API}/fixtures/{fid}", headers=H(admin_token))
        finally:
            ws.close()


# ---------- 11. Delete cascade ----------
def test_delete_fixture_cascades(s, admin_token):
    f, _, _ = _create_fixture(s, admin_token, court=10)
    fid = f["id"]
    # Confirm matches exist
    detail = s.get(f"{API}/fixtures/{fid}").json()
    assert detail["matches_total"] == 12
    # Delete
    r = s.delete(f"{API}/fixtures/{fid}", headers=H(admin_token))
    assert r.status_code == 200
    # Cascade — match ids gone
    for round_ in detail["rounds"]:
        for m in round_["matches"]:
            rr = s.get(f"{API}/matches/{m['id']}")
            assert rr.status_code == 404
    rr = s.get(f"{API}/fixtures/{fid}")
    assert rr.status_code == 404
