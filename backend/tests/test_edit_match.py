"""Backend tests for match edit feature (score/target editing via PUT /api/matches/{id}).

Covers:
- Direct score edit (score_a/score_b)
- Target score edit
- Auto-complete on edit (status='completed' + winner_team_id auto-set)
- Regression: +1 score endpoint still works
"""
import os
import json
import subprocess
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://courtroom-stream.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
T = 30


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/referee/login", json={"pin": "9832"}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture()
def scenario(headers):
    """Create a fresh fixture+match per test so each starts clean."""
    teams = requests.get(f"{API}/teams", timeout=T).json()
    team_a = next(t for t in teams if t["name"] == "SAMEER")
    team_b = next(t for t in teams if t["name"] == "PRATIK")
    payload = {
        "team_a_id": team_a["id"], "team_b_id": team_b["id"],
        "court_number": 11, "target_score": 15,
    }
    r = requests.post(f"{API}/fixtures", json=payload, headers=headers, timeout=T)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    requests.post(f"{API}/fixtures/{fid}/start", headers=headers, timeout=T)
    requests.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=headers, timeout=T)
    fx = requests.get(f"{API}/fixtures/{fid}", timeout=T).json()
    m1 = fx["rounds"][0]["matches"][0]
    mid = m1["id"]
    players_a = [p["id"] for p in team_a["players"][:2]]
    players_b = [p["id"] for p in team_b["players"][:2]]
    requests.put(f"{API}/matches/{mid}", json={
        "team_a_player_ids": players_a, "team_b_player_ids": players_b,
    }, headers=headers, timeout=T)
    ctx = {"fixture_id": fid, "match_id": mid, "team_a_id": team_a["id"], "team_b_id": team_b["id"]}
    yield ctx
    # teardown - delete fixture
    requests.delete(f"{API}/fixtures/{fid}", headers=headers, timeout=T)


def _start_match(headers, mid):
    r = requests.post(f"{API}/matches/{mid}/start", headers=headers, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()


class TestEditMatch:
    """PUT /api/matches/{id} score & target edit"""

    def test_direct_score_edit_persists(self, headers, scenario):
        mid = scenario["match_id"]
        _start_match(headers, mid)
        r = requests.put(f"{API}/matches/{mid}", json={"score_a": 7, "score_b": 3}, headers=headers, timeout=T)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["score_a"] == 7
        assert data["score_b"] == 3
        # verify persisted via GET
        g = requests.get(f"{API}/matches/{mid}", timeout=T).json()
        assert g["score_a"] == 7
        assert g["score_b"] == 3

    def test_target_score_edit_persists(self, headers, scenario):
        mid = scenario["match_id"]
        _start_match(headers, mid)
        r = requests.put(f"{API}/matches/{mid}", json={"target_score": 10}, headers=headers, timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["target_score"] == 10
        g = requests.get(f"{API}/matches/{mid}", timeout=T).json()
        assert g["target_score"] == 10

    def test_edit_all_fields_together(self, headers, scenario):
        mid = scenario["match_id"]
        _start_match(headers, mid)
        r = requests.put(f"{API}/matches/{mid}",
                         json={"score_a": 5, "score_b": 4, "target_score": 11},
                         headers=headers, timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["score_a"] == 5 and d["score_b"] == 4 and d["target_score"] == 11

    def test_auto_complete_on_edit_sets_winner(self, headers, scenario):
        """When a side reaches target and status='completed' is sent,
        backend should mark the match completed. Winner_team_id auto-set is required
        per spec (Auto-complete on edit test case).
        """
        mid = scenario["match_id"]
        _start_match(headers, mid)
        # Set A to 15 with target 15, mark completed
        r = requests.put(f"{API}/matches/{mid}",
                         json={"score_a": 15, "score_b": 3, "target_score": 15, "status": "completed"},
                         headers=headers, timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "completed"
        assert d["score_a"] == 15
        # Winner should be team A (score_a >= target)
        assert d.get("winner_team_id") == scenario["team_a_id"], (
            f"Expected winner_team_id to auto-set to team_a on auto-complete, got {d.get('winner_team_id')}"
        )

    def test_regression_score_plus_one(self, headers, scenario):
        mid = scenario["match_id"]
        _start_match(headers, mid)
        # Reset via PUT
        requests.put(f"{API}/matches/{mid}", json={"score_a": 0, "score_b": 0}, headers=headers, timeout=T)
        r = requests.post(f"{API}/matches/{mid}/score", params={"side": "a"}, headers=headers, timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["score_a"] == 1
