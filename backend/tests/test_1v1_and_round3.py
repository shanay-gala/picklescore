"""Backend tests for 1v1 matches + Round 3 having 4 matches (13 total per fixture)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://courtroom-stream.preview.emergentagent.com").rstrip("/")
REF_PIN = "9832"


@pytest.fixture(scope="module")
def ref_token():
    r = requests.post(f"{BASE_URL}/api/auth/referee/login", json={"pin": REF_PIN}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdr(ref_token):
    return {"Authorization": f"Bearer {ref_token}"}


@pytest.fixture(scope="module")
def teams():
    r = requests.get(f"{BASE_URL}/api/teams", timeout=15)
    assert r.status_code == 200
    ts = r.json()
    assert len(ts) >= 2, "Need at least 2 teams"
    return ts


created_fixtures = []


def _create_fixture(hdr, teams, target=3):
    payload = {
        "team_a_id": teams[0]["id"],
        "team_b_id": teams[1]["id"],
        "court_number": 9,
        "target_score": target,
    }
    r = requests.post(f"{BASE_URL}/api/fixtures", json=payload, headers=hdr, timeout=20)
    assert r.status_code == 200, r.text
    fx = r.json()
    created_fixtures.append(fx["id"])
    return fx


def test_leaderboard_regression():
    r = requests.get(f"{BASE_URL}/api/leaderboard", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 8


def test_teams_regression(teams):
    # Existing prod has 12 S2 teams
    assert len(teams) >= 8
    for t in teams:
        assert "players" in t


def test_players_regression():
    r = requests.get(f"{BASE_URL}/api/players", timeout=15)
    assert r.status_code == 200
    ps = r.json()
    assert isinstance(ps, list)
    assert len(ps) >= 48


def test_fixture_has_13_matches_3_3_4_3(hdr, teams):
    fx = _create_fixture(hdr, teams)
    # verify via GET
    r = requests.get(f"{BASE_URL}/api/fixtures/{fx['id']}", timeout=15)
    assert r.status_code == 200
    full = r.json()
    rounds = full["rounds"]
    assert len(rounds) == 4, f"Expected 4 rounds, got {len(rounds)}"
    counts = {r["round_number"]: len(r["matches"]) for r in rounds}
    assert counts == {1: 3, 2: 3, 3: 4, 4: 3}, f"Round match counts wrong: {counts}"
    total = sum(counts.values())
    assert total == 13, f"Expected 13 matches, got {total}"


def test_1v1_match_start_ok(hdr, teams):
    fx = _create_fixture(hdr, teams, target=3)
    # get full fixture w/ matches
    full = requests.get(f"{BASE_URL}/api/fixtures/{fx['id']}", timeout=15).json()

    # Start fixture
    r = requests.post(f"{BASE_URL}/api/fixtures/{fx['id']}/start", headers=hdr, timeout=15)
    assert r.status_code == 200

    # Start round 1
    r = requests.post(f"{BASE_URL}/api/fixtures/{fx['id']}/rounds/1/start", headers=hdr, timeout=15)
    assert r.status_code == 200

    round1 = next(r for r in full["rounds"] if r["round_number"] == 1)
    match = round1["matches"][0]

    team_a = next(t for t in teams if t["id"] == fx["team_a_id"])
    team_b = next(t for t in teams if t["id"] == fx["team_b_id"])
    pa_id = team_a["players"][0]["id"]
    pb_id = team_b["players"][0]["id"]

    # Assign 1 player per side
    r = requests.put(
        f"{BASE_URL}/api/matches/{match['id']}",
        json={"team_a_player_ids": [pa_id], "team_b_player_ids": [pb_id]},
        headers=hdr,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert len(updated["team_a_player_ids"]) == 1
    assert len(updated["team_b_player_ids"]) == 1

    # Start match - must succeed
    r = requests.post(f"{BASE_URL}/api/matches/{match['id']}/start", headers=hdr, timeout=15)
    assert r.status_code == 200, f"1v1 start failed: {r.text}"
    started = r.json()
    assert started["status"] == "live"

    # Score 3 points to team a, target_score=3 => auto-complete
    for _ in range(3):
        r = requests.post(
            f"{BASE_URL}/api/matches/{match['id']}/score?side=a",
            headers=hdr,
            timeout=15,
        )
        assert r.status_code == 200

    final = requests.get(f"{BASE_URL}/api/matches/{match['id']}", timeout=15).json()
    assert final["status"] == "completed"
    assert final["score_a"] == 3
    assert final["winner_team_id"] == fx["team_a_id"]


def test_2v2_match_start_ok(hdr, teams):
    fx = _create_fixture(hdr, teams, target=3)
    full = requests.get(f"{BASE_URL}/api/fixtures/{fx['id']}", timeout=15).json()
    requests.post(f"{BASE_URL}/api/fixtures/{fx['id']}/start", headers=hdr, timeout=15)
    requests.post(f"{BASE_URL}/api/fixtures/{fx['id']}/rounds/1/start", headers=hdr, timeout=15)

    match = full["rounds"][0]["matches"][0]
    team_a = next(t for t in teams if t["id"] == fx["team_a_id"])
    team_b = next(t for t in teams if t["id"] == fx["team_b_id"])

    r = requests.put(
        f"{BASE_URL}/api/matches/{match['id']}",
        json={
            "team_a_player_ids": [team_a["players"][0]["id"], team_a["players"][1]["id"]],
            "team_b_player_ids": [team_b["players"][0]["id"], team_b["players"][1]["id"]],
        },
        headers=hdr,
        timeout=15,
    )
    assert r.status_code == 200
    r = requests.post(f"{BASE_URL}/api/matches/{match['id']}/start", headers=hdr, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "live"


def test_zero_players_rejected(hdr, teams):
    fx = _create_fixture(hdr, teams)
    full = requests.get(f"{BASE_URL}/api/fixtures/{fx['id']}", timeout=15).json()
    requests.post(f"{BASE_URL}/api/fixtures/{fx['id']}/start", headers=hdr, timeout=15)
    requests.post(f"{BASE_URL}/api/fixtures/{fx['id']}/rounds/1/start", headers=hdr, timeout=15)
    match = full["rounds"][0]["matches"][0]
    r = requests.post(f"{BASE_URL}/api/matches/{match['id']}/start", headers=hdr, timeout=15)
    assert r.status_code == 400
    assert "1 or 2 players" in r.json().get("detail", "")


def test_more_than_two_truncated(hdr, teams):
    fx = _create_fixture(hdr, teams)
    full = requests.get(f"{BASE_URL}/api/fixtures/{fx['id']}", timeout=15).json()
    match = full["rounds"][0]["matches"][0]
    team_a = next(t for t in teams if t["id"] == fx["team_a_id"])
    ids = [p["id"] for p in team_a["players"][:3]]
    r = requests.put(
        f"{BASE_URL}/api/matches/{match['id']}",
        json={"team_a_player_ids": ids},
        headers=hdr,
        timeout=15,
    )
    assert r.status_code == 200
    assert len(r.json()["team_a_player_ids"]) == 2


def test_cleanup_all_created_fixtures(hdr):
    for fid in created_fixtures:
        r = requests.delete(f"{BASE_URL}/api/fixtures/{fid}", headers=hdr, timeout=15)
        assert r.status_code == 200
    # verify no test fixtures remain by checking list
    r = requests.get(f"{BASE_URL}/api/fixtures", timeout=15)
    assert r.status_code == 200
    ids = {f["id"] for f in r.json()}
    for fid in created_fixtures:
        assert fid not in ids
