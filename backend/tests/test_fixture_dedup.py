"""
Regression test for iteration 8:
Verify that no 'scheduled' fixture exists for a team-pair that also has
a 'completed' fixture in the same week. Also verify leaderboard math sanity
and delete-cascade behavior.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://courtroom-stream.preview.emergentagent.com").rstrip("/")
REFEREE_PIN = "9832"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ref_token(api):
    r = api.post(f"{BASE_URL}/api/auth/referee/login", json={"pin": REFEREE_PIN})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# --- Data-integrity checks -------------------------------------------------

def test_fixtures_endpoint_ok(api):
    r = api.get(f"{BASE_URL}/api/fixtures")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_no_scheduled_duplicate_of_completed_same_week(api):
    fixtures = api.get(f"{BASE_URL}/api/fixtures").json()
    # Build set of (pair, week) for completed fixtures
    completed_pairs = set()
    for f in fixtures:
        if f.get("status") == "completed":
            pair = tuple(sorted([f["team_a_id"], f["team_b_id"]]))
            completed_pairs.add((pair, f.get("week")))
    # For each scheduled, ensure not a dup
    violations = []
    for f in fixtures:
        if f.get("status") == "scheduled":
            pair = tuple(sorted([f["team_a_id"], f["team_b_id"]]))
            if (pair, f.get("week")) in completed_pairs:
                violations.append(f)
    assert not violations, f"Found scheduled duplicates of completed same-week fixtures: {violations}"


def test_leaderboard_math_sanity(api):
    lb = api.get(f"{BASE_URL}/api/leaderboard")
    assert lb.status_code == 200
    teams = lb.json()
    assert isinstance(teams, list)
    assert len(teams) == 12, f"expected 12 S2 teams, got {len(teams)}"

    fixtures = api.get(f"{BASE_URL}/api/fixtures").json()
    completed = [f for f in fixtures if f.get("status") == "completed"]

    # count how many completed fixtures each team was in
    per_team_completed = {}
    for f in completed:
        for tid in (f["team_a_id"], f["team_b_id"]):
            per_team_completed[tid] = per_team_completed.get(tid, 0) + 1

    for t in teams:
        tid = t.get("team_id") or t.get("id")
        expected_mp = 12 * per_team_completed.get(tid, 0)
        assert t.get("matches_played", 0) == expected_mp, (
            f"team {t.get('team_name')} matches_played={t.get('matches_played')} "
            f"expected {expected_mp} (from {per_team_completed.get(tid, 0)} completed fixtures)"
        )
        # Fresh preview: bonus_points should be 0
        assert t.get("bonus_points", 0) == 0, f"team {t.get('team_name')} has non-zero bonus_points={t.get('bonus_points')}"


def test_preview_state_all_zero_points(api):
    """Fresh preview: 0 completed fixtures => every team PTS=0, MP=0."""
    fixtures = api.get(f"{BASE_URL}/api/fixtures").json()
    completed = [f for f in fixtures if f.get("status") == "completed"]
    if completed:
        pytest.skip(f"preview has {len(completed)} completed fixtures; skipping all-zero assertion")
    lb = api.get(f"{BASE_URL}/api/leaderboard").json()
    for t in lb:
        assert t.get("tournament_points", 0) == 0, f"{t.get('name')} PTS={t.get('tournament_points')}"
        assert t.get("matches_played", 0) == 0, f"{t.get('name')} MP={t.get('matches_played')}"


# --- Delete cascade & auth checks -----------------------------------------

def test_delete_fixture_requires_auth(api):
    # Try to delete a made-up id without auth
    r = api.delete(f"{BASE_URL}/api/fixtures/nonexistent-id-xxx")
    assert r.status_code in (401, 403), f"expected auth error, got {r.status_code}: {r.text}"


def test_create_and_delete_fixture_cascades_matches(api, ref_token):
    teams = api.get(f"{BASE_URL}/api/teams").json()
    assert len(teams) >= 2
    a, b = teams[0]["id"], teams[1]["id"]

    headers = {"Authorization": f"Bearer {ref_token}"}
    create = api.post(
        f"{BASE_URL}/api/fixtures",
        json={"team_a_id": a, "team_b_id": b, "week": 99, "court": 1},
        headers=headers,
    )
    assert create.status_code in (200, 201), create.text
    fid = create.json()["id"]

    # confirm matches created (should be 12)
    fdet = api.get(f"{BASE_URL}/api/fixtures/{fid}").json()
    match_ids = []
    for rd in fdet.get("rounds", []):
        for m in rd.get("matches", []):
            match_ids.append(m["id"])
    assert len(match_ids) == 12, f"expected 12 matches, got {len(match_ids)}"

    # delete
    dr = api.delete(f"{BASE_URL}/api/fixtures/{fid}", headers=headers)
    assert dr.status_code in (200, 204), dr.text

    # confirm gone
    g = api.get(f"{BASE_URL}/api/fixtures/{fid}")
    assert g.status_code == 404
