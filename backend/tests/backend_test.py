"""End-to-end backend regression suite for PickleScore / Kurukshetra Picklewave.

Covers:
  * Health & tournament status
  * Team seed (8 teams, captain flag)
  * Leaderboard baseline (HEET #1 @ 634)
  * Referee & admin auth (positive + negative)
  * Protected route enforcement
  * Fixture lifecycle -> 12 auto-matches, start, round start,
    player assignment, match start, scoring, auto-complete cascade,
    undo semantics
  * WebSocket hello + broadcast on mutation
"""
import asyncio
import json
import os
import time
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ["REACT_APP_BACKEND_URL_TEST"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL_TEST") else "https://courtroom-stream.preview.emergentagent.com"
API = f"{BASE_URL}/api"
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"

EXPECTED_TEAMS = {"HEET", "HEMIL", "HETANKSH", "KIRAN", "PRATIK", "SAMEER", "SIDDHARTH", "URVIL"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def ref_token(session):
    r = session.post(f"{API}/auth/referee/login", json={"pin": "9832"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "referee"
    assert data.get("access_token")
    return data["access_token"]


@pytest.fixture(scope="session")
def auth_session(session, ref_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {ref_token}"})
    return s


@pytest.fixture(scope="session")
def teams(session):
    r = session.get(f"{API}/teams")
    assert r.status_code == 200
    return r.json()


# ---------- Health & meta ----------
class TestHealth:
    def test_health(self, session):
        r = session.get(f"{API}/health")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "ts" in d and d["ts"]

    def test_tournament_status(self, session):
        r = session.get(f"{API}/tournament/status")
        assert r.status_code == 200
        d = r.json()
        assert "current_week" in d and isinstance(d["current_week"], int)
        assert d["start_week"] == 5


# ---------- Teams seed ----------
class TestTeams:
    def test_teams_count_and_names(self, teams):
        assert len(teams) == 8
        names = {t["name"] for t in teams}
        assert names == EXPECTED_TEAMS

    def test_each_team_has_players_and_one_captain(self, teams):
        for t in teams:
            players = t.get("players") or []
            assert len(players) == 6, f"{t['name']} has {len(players)} players"
            captains = [p for p in players if p.get("is_captain")]
            assert len(captains) == 1, f"{t['name']} captains={len(captains)}"

    def test_heet_captain_name(self, teams):
        heet = next(t for t in teams if t["name"] == "HEET")
        assert "heet navin chheda" in (heet.get("captain_name") or "").lower()


# ---------- Leaderboard ----------
class TestLeaderboard:
    def test_leaderboard_baseline(self, session):
        r = session.get(f"{API}/leaderboard")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 8
        # Sorted by tournament_points desc
        pts = [row["tournament_points"] for row in rows]
        assert pts == sorted(pts, reverse=True)
        # HEET should be #1 with baseline 634 (assuming no live scoring yet
        # or scored points still keep it on top)
        top = rows[0]
        assert top["team_name"] == "HEET", f"Top team is {top['team_name']} pts={top['tournament_points']}"
        assert top["tournament_points"] >= 634


# ---------- Auth ----------
class TestAuth:
    def test_referee_login_success(self, session):
        r = session.post(f"{API}/auth/referee/login", json={"pin": "9832"})
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "referee"
        assert d["access_token"]

    def test_referee_login_bad_pin(self, session):
        r = session.post(f"{API}/auth/referee/login", json={"pin": "0000"})
        assert r.status_code in (400, 401)

    def test_referee_login_wrong_length(self, session):
        r = session.post(f"{API}/auth/referee/login", json={"pin": "12"})
        assert r.status_code == 400

    def test_admin_login_success(self, session):
        r = session.post(f"{API}/auth/admin/login",
                         json={"email": "shanaygala@gmail.com", "password": "admin123"})
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "admin"
        assert d["access_token"]

    def test_admin_login_bad_password(self, session):
        r = session.post(f"{API}/auth/admin/login",
                         json={"email": "shanaygala@gmail.com", "password": "wrong"})
        assert r.status_code == 401

    def test_protected_route_requires_token(self, session, teams):
        team_ids = [t["id"] for t in teams[:2]]
        r = session.post(f"{API}/fixtures",
                         json={"team_a_id": team_ids[0], "team_b_id": team_ids[1]})
        assert r.status_code == 401


# ---------- Fixture lifecycle ----------
@pytest.fixture(scope="class")
def lifecycle_fixture(auth_session, teams):
    # Use two teams with lowest baseline to minimize impact on leaderboard
    team_a = next(t for t in teams if t["name"] == "SAMEER")
    team_b = next(t for t in teams if t["name"] == "PRATIK")
    payload = {
        "team_a_id": team_a["id"],
        "team_b_id": team_b["id"],
        "court_number": 9,
        "target_score": 3,  # small target so we can auto-complete quickly
    }
    r = auth_session.post(f"{API}/fixtures", json=payload)
    assert r.status_code == 200, r.text
    f = r.json()
    yield {"fixture": f, "team_a": team_a, "team_b": team_b}
    # teardown
    try:
        auth_session.delete(f"{API}/fixtures/{f['id']}")
    except Exception:
        pass


class TestFixtureLifecycle:
    def test_fixture_creates_12_matches(self, lifecycle_fixture):
        f = lifecycle_fixture["fixture"]
        assert f["matches_total"] == 12
        assert len(f["rounds"]) == 4
        for rd in f["rounds"]:
            assert len(rd["matches"]) == 3

    def test_unauth_start_rejected(self, session, lifecycle_fixture):
        f = lifecycle_fixture["fixture"]
        r = session.post(f"{API}/fixtures/{f['id']}/start")
        assert r.status_code == 401

    def test_start_fixture(self, auth_session, lifecycle_fixture):
        f = lifecycle_fixture["fixture"]
        r = auth_session.post(f"{API}/fixtures/{f['id']}/start")
        assert r.status_code == 200
        assert r.json()["status"] == "live"

    def test_start_round_1(self, auth_session, lifecycle_fixture):
        f = lifecycle_fixture["fixture"]
        r = auth_session.post(f"{API}/fixtures/{f['id']}/rounds/1/start")
        assert r.status_code == 200
        data = r.json()
        r1 = next(rd for rd in data["rounds"] if rd["round_number"] == 1)
        assert r1["status"] == "live"

    def test_full_round_auto_completes(self, auth_session, lifecycle_fixture):
        """Assign players, start each match in round 1, score to target=3,
        verify auto-completion cascades: round.status -> completed."""
        fid = lifecycle_fixture["fixture"]["id"]
        team_a = lifecycle_fixture["team_a"]
        team_b = lifecycle_fixture["team_b"]
        players_a = [p["id"] for p in team_a["players"][:2]]
        players_b = [p["id"] for p in team_b["players"][:2]]

        # Get full fixture with matches
        r = auth_session.get(f"{API}/fixtures/{fid}")
        assert r.status_code == 200
        rounds = r.json()["rounds"]
        r1_matches = next(rd for rd in rounds if rd["round_number"] == 1)["matches"]
        assert len(r1_matches) == 3

        target_score = None
        for idx, match in enumerate(r1_matches):
            mid = match["id"]
            # assign 2 players per side
            rp = auth_session.put(f"{API}/matches/{mid}", json={
                "team_a_player_ids": players_a,
                "team_b_player_ids": players_b,
            })
            assert rp.status_code == 200, rp.text
            target_score = rp.json().get("target_score", 3)
            # start match
            rs = auth_session.post(f"{API}/matches/{mid}/start")
            assert rs.status_code == 200, rs.text
            assert rs.json()["status"] == "live"

            # For the FIRST match, also test undo & side b scoring, then finish
            if idx == 0:
                # Score side A once
                r1 = auth_session.post(f"{API}/matches/{mid}/score", params={"side": "a"})
                assert r1.status_code == 200
                assert r1.json()["score_a"] == 1
                # Undo
                ru = auth_session.post(f"{API}/matches/{mid}/undo")
                assert ru.status_code == 200
                assert ru.json()["score_a"] == 0

            # Score side A to target -> auto-complete
            final = None
            for _ in range(target_score):
                rr = auth_session.post(f"{API}/matches/{mid}/score", params={"side": "a"})
                assert rr.status_code == 200
                final = rr.json()
            assert final["status"] == "completed"
            assert final["score_a"] >= target_score
            assert final["winner_team_id"] == team_a["id"]

        # After all 3 matches in round 1 done, round.status should be completed
        r = auth_session.get(f"{API}/fixtures/{fid}")
        assert r.status_code == 200
        rounds = r.json()["rounds"]
        r1 = next(rd for rd in rounds if rd["round_number"] == 1)
        assert r1["status"] == "completed", f"round1 status={r1['status']}"

    def test_full_fixture_auto_completes(self, auth_session, lifecycle_fixture):
        """Run rounds 2-4 to trigger fixture auto-completion."""
        fid = lifecycle_fixture["fixture"]["id"]
        team_a = lifecycle_fixture["team_a"]
        team_b = lifecycle_fixture["team_b"]
        players_a = [p["id"] for p in team_a["players"][:2]]
        players_b = [p["id"] for p in team_b["players"][:2]]

        for round_num in (2, 3, 4):
            rs = auth_session.post(f"{API}/fixtures/{fid}/rounds/{round_num}/start")
            assert rs.status_code == 200, f"start round {round_num}: {rs.text}"

            r = auth_session.get(f"{API}/fixtures/{fid}")
            rd = next(x for x in r.json()["rounds"] if x["round_number"] == round_num)
            for match in rd["matches"]:
                mid = match["id"]
                auth_session.put(f"{API}/matches/{mid}", json={
                    "team_a_player_ids": players_a,
                    "team_b_player_ids": players_b,
                })
                auth_session.post(f"{API}/matches/{mid}/start")
                target = match.get("target_score", 3)
                for _ in range(target):
                    auth_session.post(f"{API}/matches/{mid}/score", params={"side": "b"})

        r = auth_session.get(f"{API}/fixtures/{fid}")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "completed", f"fixture status={d['status']}"
        assert d["matches_completed"] == 12
        # Winner should be team B (they won 9 matches vs A won 3)
        assert d["winner_team_id"] == team_b["id"]


# ---------- WebSocket ----------
class TestWebSocket:
    @pytest.mark.timeout(15)
    def test_ws_hello_and_broadcast(self, auth_session, teams):
        async def run():
            async with websockets.connect(WS_URL, ping_interval=None) as ws:
                first = await asyncio.wait_for(ws.recv(), timeout=5)
                hello = json.loads(first)
                assert hello.get("type") == "hello"

                # Create a fixture in a thread to trigger broadcast
                team_ids = [t["id"] for t in teams[:2]]
                # perform mutation in another thread so the loop continues
                loop = asyncio.get_event_loop()

                def mutate():
                    return auth_session.post(f"{API}/fixtures", json={
                        "team_a_id": team_ids[0],
                        "team_b_id": team_ids[1],
                        "court_number": 12,
                        "target_score": 3,
                    })

                fut = loop.run_in_executor(None, mutate)

                got_event = False
                fixture_id = None
                deadline = time.time() + 6
                while time.time() < deadline:
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=3)
                    except asyncio.TimeoutError:
                        break
                    data = json.loads(msg)
                    if data.get("type") in ("fixture_changed", "teams_changed"):
                        got_event = True
                        fixture_id = data.get("fixture_id")
                        break
                resp = await fut
                assert resp.status_code == 200
                # cleanup created fixture
                try:
                    auth_session.delete(f"{API}/fixtures/{resp.json()['id']}")
                except Exception:
                    pass
                assert got_event, "No fixture_changed/teams_changed event received"

        asyncio.run(run())
