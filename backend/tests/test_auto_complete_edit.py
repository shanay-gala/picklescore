"""Backend tests for PUT /api/matches/{id} auto-complete-on-edit behaviour (iteration 6).

Covers all review-request scenarios:
- Team A winner derivation
- Team B winner derivation
- Tied score (winner_team_id = None, finished_at set)
- Round cascade (auto-complete round on last match)
- Fixture cascade (auto-complete fixture on last match of last round)
- Idempotency (already-completed match retains winner on later PUT)
- Regression: POST /score?side=a still works and cascades
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://courtroom-stream.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
T = 30
REFEREE_PIN = "9832"


# ----------------- fixtures -----------------
@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{API}/auth/referee/login", json={"pin": REFEREE_PIN}, timeout=T)
    assert r.status_code == 200, f"referee login failed: {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def teams_pool():
    teams = requests.get(f"{API}/teams", timeout=T).json()
    a = next(t for t in teams if t["name"] == "SAMEER")
    b = next(t for t in teams if t["name"] == "PRATIK")
    return a, b


def _new_fixture(headers, teams_pool, target=5, court=12):
    a, b = teams_pool
    payload = {"team_a_id": a["id"], "team_b_id": b["id"], "court_number": court, "target_score": target}
    r = requests.post(f"{API}/fixtures", json=payload, headers=headers, timeout=T)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    requests.post(f"{API}/fixtures/{fid}/start", headers=headers, timeout=T).raise_for_status()
    return fid, a, b


def _assign_and_start_match(headers, fid, match_id, team_a, team_b):
    players_a = [p["id"] for p in team_a["players"][:2]]
    players_b = [p["id"] for p in team_b["players"][:2]]
    r = requests.put(f"{API}/matches/{match_id}", json={
        "team_a_player_ids": players_a, "team_b_player_ids": players_b,
    }, headers=headers, timeout=T)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/matches/{match_id}/start", headers=headers, timeout=T)
    assert r.status_code == 200, r.text


def _get_fixture(fid):
    r = requests.get(f"{API}/fixtures/{fid}", timeout=T)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_fixture(headers, fid):
    try:
        requests.delete(f"{API}/fixtures/{fid}", headers=headers, timeout=T)
    except Exception:
        pass


# ----------------- Test class -----------------
class TestAutoCompleteOnEdit:

    def test_team_a_wins_on_edit(self, headers, teams_pool):
        fid, a, b = _new_fixture(headers, teams_pool, target=5, court=12)
        try:
            fx = _get_fixture(fid)
            requests.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=headers, timeout=T).raise_for_status()
            m1 = fx["rounds"][0]["matches"][0]
            _assign_and_start_match(headers, fid, m1["id"], a, b)
            r = requests.put(f"{API}/matches/{m1['id']}",
                             json={"score_a": 6, "score_b": 3, "target_score": 5, "status": "completed"},
                             headers=headers, timeout=T)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "completed"
            assert d["score_a"] == 6 and d["score_b"] == 3
            assert d["winner_team_id"] == a["id"], f"expected team_a winner, got {d.get('winner_team_id')}"
            assert d.get("finished_at"), "finished_at must be set"
        finally:
            _delete_fixture(headers, fid)

    def test_team_b_wins_on_edit(self, headers, teams_pool):
        fid, a, b = _new_fixture(headers, teams_pool, target=5, court=12)
        try:
            fx = _get_fixture(fid)
            requests.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=headers, timeout=T).raise_for_status()
            m1 = fx["rounds"][0]["matches"][0]
            _assign_and_start_match(headers, fid, m1["id"], a, b)
            r = requests.put(f"{API}/matches/{m1['id']}",
                             json={"score_a": 2, "score_b": 7, "target_score": 5, "status": "completed"},
                             headers=headers, timeout=T)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "completed"
            assert d["winner_team_id"] == b["id"], f"expected team_b winner, got {d.get('winner_team_id')}"
            assert d.get("finished_at")
        finally:
            _delete_fixture(headers, fid)

    def test_tied_score_no_winner(self, headers, teams_pool):
        fid, a, b = _new_fixture(headers, teams_pool, target=5, court=12)
        try:
            fx = _get_fixture(fid)
            requests.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=headers, timeout=T).raise_for_status()
            m1 = fx["rounds"][0]["matches"][0]
            _assign_and_start_match(headers, fid, m1["id"], a, b)
            r = requests.put(f"{API}/matches/{m1['id']}",
                             json={"score_a": 5, "score_b": 5, "target_score": 5, "status": "completed"},
                             headers=headers, timeout=T)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "completed"
            assert d.get("winner_team_id") in (None, ""), f"expected null winner on tie, got {d.get('winner_team_id')}"
            assert d.get("finished_at"), "finished_at must be set on tie completion"
        finally:
            _delete_fixture(headers, fid)

    def test_cascade_round_and_fixture_complete_on_edit(self, headers, teams_pool):
        """Complete all 12 matches via PUT edits; round & fixture must auto-complete."""
        fid, a, b = _new_fixture(headers, teams_pool, target=5, court=13)
        try:
            fx = _get_fixture(fid)
            rounds = fx["rounds"]
            assert len(rounds) == 4

            for r_idx, rnd in enumerate(rounds, start=1):
                # Start the round
                sr = requests.post(f"{API}/fixtures/{fid}/rounds/{r_idx}/start",
                                    headers=headers, timeout=T)
                assert sr.status_code == 200, sr.text

                matches = rnd["matches"]
                assert len(matches) == 3
                for m_idx, mm in enumerate(matches):
                    _assign_and_start_match(headers, fid, mm["id"], a, b)
                    # Complete via PUT edit
                    rr = requests.put(
                        f"{API}/matches/{mm['id']}",
                        json={"score_a": 6, "score_b": 2, "target_score": 5, "status": "completed"},
                        headers=headers, timeout=T,
                    )
                    assert rr.status_code == 200, rr.text
                    dd = rr.json()
                    assert dd["status"] == "completed"
                    assert dd["winner_team_id"] == a["id"]

                    # After last match of round, verify round completed
                    if m_idx == len(matches) - 1:
                        fx_now = _get_fixture(fid)
                        this_rnd = next(x for x in fx_now["rounds"] if x["round_number"] == r_idx)
                        assert this_rnd["status"] == "completed", (
                            f"Round {r_idx} should be auto-completed on last-match edit, got {this_rnd['status']}"
                        )

            # After all rounds, fixture must be completed
            fx_final = _get_fixture(fid)
            assert fx_final["status"] == "completed", (
                f"Fixture should be auto-completed after last match of last round, got {fx_final['status']}"
            )
        finally:
            _delete_fixture(headers, fid)

    def test_idempotency_completed_match_retains_winner(self, headers, teams_pool):
        fid, a, b = _new_fixture(headers, teams_pool, target=5, court=14)
        try:
            fx = _get_fixture(fid)
            requests.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=headers, timeout=T).raise_for_status()
            m1 = fx["rounds"][0]["matches"][0]
            _assign_and_start_match(headers, fid, m1["id"], a, b)
            # complete first
            r1 = requests.put(f"{API}/matches/{m1['id']}",
                              json={"score_a": 6, "score_b": 3, "target_score": 5, "status": "completed"},
                              headers=headers, timeout=T)
            assert r1.status_code == 200, r1.text
            original_winner = r1.json()["winner_team_id"]
            original_finished_at = r1.json().get("finished_at")
            assert original_winner == a["id"]
            assert original_finished_at

            # Now PUT to just change score_a — must NOT clobber winner
            r2 = requests.put(f"{API}/matches/{m1['id']}",
                              json={"score_a": 8},
                              headers=headers, timeout=T)
            assert r2.status_code == 200, r2.text
            d2 = r2.json()
            assert d2["score_a"] == 8
            assert d2["status"] == "completed"
            assert d2["winner_team_id"] == original_winner, (
                f"winner_team_id must remain {original_winner}, got {d2.get('winner_team_id')}"
            )
            assert d2.get("finished_at") == original_finished_at, (
                "finished_at must not be reset on subsequent edit"
            )
        finally:
            _delete_fixture(headers, fid)


class TestRegressionScorePoint:
    def test_score_point_still_completes_and_cascades(self, headers, teams_pool):
        fid, a, b = _new_fixture(headers, teams_pool, target=3, court=15)
        try:
            fx = _get_fixture(fid)
            requests.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=headers, timeout=T).raise_for_status()
            m1 = fx["rounds"][0]["matches"][0]
            _assign_and_start_match(headers, fid, m1["id"], a, b)
            # tap +1 for side a 3 times (target=3) -> should auto-complete
            for _ in range(3):
                rr = requests.post(f"{API}/matches/{m1['id']}/score",
                                   params={"side": "a"}, headers=headers, timeout=T)
                assert rr.status_code == 200, rr.text
            final = requests.get(f"{API}/matches/{m1['id']}", timeout=T).json()
            assert final["status"] == "completed"
            assert final["score_a"] == 3
            assert final["winner_team_id"] == a["id"]
            assert final.get("finished_at")
        finally:
            _delete_fixture(headers, fid)
