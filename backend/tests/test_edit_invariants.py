"""
Iteration 10 — invariants around production data edits:
(a) PUT /api/players/{id} preserves is_captain (and reveals field-reset behaviour)
(b) PUT /api/matches/{id} score edit on completed match preserves status/winner/finished_at
(c) GET /api/leaderboard cascade math is exact after score edits
"""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


def _pin():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing test_credentials.md")
    m = re.search(r"(?im)^\s*[-*]?\s*PIN:\s*`?(\d+)", p.read_text())
    if not m:
        pytest.skip("no referee PIN in test_credentials.md")
    return m.group(1)


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/referee/login", json={"pin": _pin()})
    if r.status_code != 200:
        pytest.fail(f"referee login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token")
    assert tok, f"no access_token in {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def teams(client):
    r = client.get(f"{BASE_URL}/api/teams")
    assert r.status_code == 200
    t = r.json()
    assert len(t) >= 2, f"need >=2 teams, got {len(t)}"
    return t


# ---------- (a) Players ----------
class TestPlayerUpdate:
    def test_update_name_preserves_is_captain(self, client, teams):
        team = teams[0]
        cr = client.post(f"{BASE_URL}/api/players", json={
            "name": "TEST_CaptainInvariant", "team_id": team["id"],
            "category": "advance", "contact": "9999999999", "age": 30})
        assert cr.status_code == 200, cr.text
        p = cr.json()
        pid = p["id"]
        try:
            assert p["is_captain"] is False
            # force captain flag directly through team detail? Not available; simulate by
            # asserting flag survives update for a non-captain and for an existing captain.
            up = client.put(f"{BASE_URL}/api/players/{pid}", json={
                "name": "TEST_CaptainInvariant_Renamed", "team_id": team["id"],
                "category": "advance", "contact": "9999999999", "age": 30})
            assert up.status_code == 200, up.text
            d = up.json()
            assert d["name"] == "TEST_CaptainInvariant_Renamed"
            assert d["category"] == "advance"
            assert d["is_captain"] is False
            assert "_id" not in d
            # GET verify persistence
            lst = client.get(f"{BASE_URL}/api/players?team_id={team['id']}").json()
            got = next(x for x in lst if x["id"] == pid)
            assert got["name"] == "TEST_CaptainInvariant_Renamed"
            assert got["category"] == "advance"
        finally:
            client.delete(f"{BASE_URL}/api/players/{pid}")

    def test_existing_captain_rename_keeps_flag(self, client, teams):
        """Rename a real captain (seeded) and restore; is_captain must persist."""
        cap = None
        for t in teams:
            pl = client.get(f"{BASE_URL}/api/players?team_id={t['id']}").json()
            cap = next((x for x in pl if x.get("is_captain")), None)
            if cap:
                break
        if not cap:
            pytest.skip("no seeded captain found")
        orig = dict(cap)
        try:
            up = client.put(f"{BASE_URL}/api/players/{cap['id']}", json={
                "name": orig["name"] + " TEST", "team_id": orig["team_id"],
                "category": orig.get("category"), "contact": orig.get("contact"),
                "age": orig.get("age")})
            assert up.status_code == 200, up.text
            assert up.json()["is_captain"] is True
            assert up.json()["category"] == orig.get("category")
        finally:
            client.put(f"{BASE_URL}/api/players/{cap['id']}", json={
                "name": orig["name"], "team_id": orig["team_id"],
                "category": orig.get("category"), "contact": orig.get("contact"),
                "age": orig.get("age")})
            back = client.get(f"{BASE_URL}/api/players?team_id={orig['team_id']}").json()
            g = next(x for x in back if x["id"] == cap["id"])
            assert g["name"] == orig["name"]
            assert g["is_captain"] is True

    def test_partial_update_resets_unspecified_fields(self, client, teams):
        """Documents PlayerIn defaults: sending only name+team_id wipes category/contact/age."""
        team = teams[0]
        p = client.post(f"{BASE_URL}/api/players", json={
            "name": "TEST_PartialUpdate", "team_id": team["id"],
            "category": "advance", "contact": "1234567890", "age": 41}).json()
        pid = p["id"]
        try:
            up = client.put(f"{BASE_URL}/api/players/{pid}",
                            json={"name": "TEST_PartialUpdate2", "team_id": team["id"]})
            assert up.status_code == 200, up.text
            d = up.json()
            assert d["category"] == "advance", (
                f"DATA LOSS: category reset to {d['category']!r} when omitted from PUT body")
            assert d["contact"] == "1234567890", "DATA LOSS: contact wiped"
            assert d["age"] == 41, "DATA LOSS: age wiped"
        finally:
            client.delete(f"{BASE_URL}/api/players/{pid}")

    def test_update_missing_player_404(self, client, teams):
        r = client.put(f"{BASE_URL}/api/players/does-not-exist",
                       json={"name": "TEST_X", "team_id": teams[0]["id"]})
        assert r.status_code == 404


# ---------- Fixture helper ----------
@pytest.fixture
def live_match(client, teams):
    """Create fixture (target 3), assign 1v1 in R1M1, start fixture+round, return (fixture, match)."""
    a, b = teams[0], teams[1]
    fr = client.post(f"{BASE_URL}/api/fixtures", json={
        "team_a_id": a["id"], "team_b_id": b["id"], "court_number": 9,
        "scheduled_at": None, "target_score": 3})
    assert fr.status_code == 200, fr.text
    fx = fr.json()
    created = [fx["id"]]
    pa = client.get(f"{BASE_URL}/api/players?team_id={a['id']}").json()
    pb = client.get(f"{BASE_URL}/api/players?team_id={b['id']}").json()
    assert pa and pb, "teams need players"
    all_matches = [mm for r in fx["rounds"] for mm in r["matches"]]
    assert all_matches, "fixture created with no matches"
    m = all_matches[0]
    up = client.put(f"{BASE_URL}/api/matches/{m['id']}", json={
        "team_a_player_ids": [pa[0]["id"]], "team_b_player_ids": [pb[0]["id"]]})
    assert up.status_code == 200, up.text
    assert client.post(f"{BASE_URL}/api/fixtures/{fx['id']}/start").status_code == 200
    assert client.post(f"{BASE_URL}/api/fixtures/{fx['id']}/rounds/1/start").status_code == 200
    assert client.post(f"{BASE_URL}/api/matches/{m['id']}/start").status_code == 200
    yield fx, m
    for fid in created:
        client.delete(f"{BASE_URL}/api/fixtures/{fid}")


# ---------- (b) Match PUT idempotency ----------
class TestCompletedMatchEdit:
    def test_score_edit_preserves_status_winner_finished_at(self, client, teams, live_match):
        fx, m = live_match
        mid = m["id"]
        for _ in range(3):
            r = client.post(f"{BASE_URL}/api/matches/{mid}/score?side=a")
            assert r.status_code == 200, r.text
        cur = client.get(f"{BASE_URL}/api/matches/{mid}").json()
        assert cur["status"] == "completed", cur
        assert cur["score_a"] == 3 and cur["score_b"] == 0
        assert cur["winner_team_id"] == cur["team_a_id"]
        finished_at = cur["finished_at"]
        assert finished_at

        # edit only score_b -> 1 (3-1, winner still A)
        up = client.put(f"{BASE_URL}/api/matches/{mid}", json={"score_b": 1})
        assert up.status_code == 200, up.text
        d = up.json()
        assert d["score_b"] == 1
        assert d["score_a"] == 3
        assert d["status"] == "completed", "status clobbered by partial PUT"
        assert d["winner_team_id"] == cur["team_a_id"], "winner changed on partial PUT"
        assert d["finished_at"] == finished_at, "finished_at rewritten"

        # persistence
        g = client.get(f"{BASE_URL}/api/matches/{mid}").json()
        assert (g["score_a"], g["score_b"]) == (3, 1)
        assert g["status"] == "completed"
        assert g["winner_team_id"] == cur["team_a_id"]
        assert g["finished_at"] == finished_at

    def test_no_fields_returns_400(self, client, live_match):
        fx, m = live_match
        r = client.put(f"{BASE_URL}/api/matches/{m['id']}", json={})
        assert r.status_code == 400

    def test_update_missing_match_404(self, client):
        r = client.put(f"{BASE_URL}/api/matches/nope-id", json={"score_b": 1})
        assert r.status_code == 404


# ---------- (c) Leaderboard cascade math ----------
class TestLeaderboardCascade:
    def test_leaderboard_reflects_score_edit_exactly(self, client, teams, live_match):
        fx, m = live_match
        mid = m["id"]
        ta, tb = fx["team_a_id"], fx["team_b_id"]

        def row(tid):
            lb = client.get(f"{BASE_URL}/api/leaderboard")
            assert lb.status_code == 200
            return next(r for r in lb.json() if r["team_id"] == tid)

        before_a, before_b = row(ta), row(tb)

        for _ in range(3):
            client.post(f"{BASE_URL}/api/matches/{mid}/score?side=a")
        mid_a, mid_b = row(ta), row(tb)
        assert mid_a["points_for"] == before_a["points_for"] + 3
        assert mid_a["tournament_points"] == before_a["tournament_points"] + 3
        assert mid_b["points_against"] == before_b["points_against"] + 3
        assert mid_b["points_for"] == before_b["points_for"]

        # edit score_b down/up: set to 1
        up = client.put(f"{BASE_URL}/api/matches/{mid}", json={"score_b": 1})
        assert up.status_code == 200, up.text
        aft_a, aft_b = row(ta), row(tb)
        assert aft_b["points_for"] == before_b["points_for"] + 1
        assert aft_b["tournament_points"] == before_b["tournament_points"] + 1
        assert aft_a["points_against"] == before_a["points_against"] + 1
        assert aft_a["points_for"] == before_a["points_for"] + 3
        assert aft_a["points_diff"] == aft_a["points_for"] - aft_a["points_against"]
        assert aft_b["points_diff"] == aft_b["points_for"] - aft_b["points_against"]

        # edit score_b back down to 0 -> deltas revert
        assert client.put(f"{BASE_URL}/api/matches/{mid}", json={"score_b": 0}).status_code == 200
        end_a, end_b = row(ta), row(tb)
        assert end_b["points_for"] == before_b["points_for"]
        assert end_a["points_against"] == before_a["points_against"]
        for r in (end_a, end_b):
            assert r["points_for"] >= 0 and r["points_against"] >= 0
            assert r["tournament_points"] >= 0

    def test_fixture_aggregate_matches_match_sum(self, client, live_match):
        fx, m = live_match
        mid = m["id"]
        for _ in range(3):
            client.post(f"{BASE_URL}/api/matches/{mid}/score?side=a")
        client.put(f"{BASE_URL}/api/matches/{mid}", json={"score_b": 1})
        f = client.get(f"{BASE_URL}/api/fixtures/{fx['id']}").json()
        ms = [mm for r in f["rounds"] for mm in r["matches"]]
        sum_a = sum(x["score_a"] for x in ms)
        sum_b = sum(x["score_b"] for x in ms)
        assert f["total_a"] == sum_a, (f["total_a"], sum_a)
        assert f["total_b"] == sum_b, (f["total_b"], sum_b)
        assert (sum_a, sum_b) == (3, 1)
        # round-level totals must match their own matches
        for r in f["rounds"]:
            assert r["total_a"] == sum(x["score_a"] for x in r["matches"])
            assert r["total_b"] == sum(x["score_b"] for x in r["matches"])


# ---------- cleanup guard ----------
def test_no_test_fixtures_left_on_court_9(client):
    fs = client.get(f"{BASE_URL}/api/fixtures").json()
    leftovers = [f for f in fs if f.get("court_number") == 9]
    for f in leftovers:
        client.delete(f"{BASE_URL}/api/fixtures/{f['id']}")
    fs2 = client.get(f"{BASE_URL}/api/fixtures").json()
    assert not [f for f in fs2 if f.get("court_number") == 9]
