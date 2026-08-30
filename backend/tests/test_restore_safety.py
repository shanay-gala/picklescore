"""
Iteration 12b — restore safety + winner_team_id flip regression (backend only).

Run serially: pytest -n 0 /app/backend/tests/test_restore_safety.py
"""
import copy
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"
MAINT_TOKEN = "restore-9832-picklewave"
REF_PIN = "9832"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/referee/login", json={"pin": REF_PIN}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def maint():
    return {"X-Maint-Token": MAINT_TOKEN}


def _backup(client, maint):
    r = client.get(f"{API}/admin/backup", headers=maint, timeout=60)
    assert r.status_code == 200
    return r.json()


def _make_fixture(client, ta, tb, players, court):
    pa = [p["id"] for p in players if p["team_id"] == ta][:2]
    pb = [p["id"] for p in players if p["team_id"] == tb][:2]
    r = client.post(
        f"{API}/fixtures",
        json={"team_a_id": ta, "team_b_id": tb, "court_number": court,
              "scheduled_at": None, "target_score": 15},
        timeout=30,
    )
    assert r.status_code in (200, 201), r.text[:300]
    fid = r.json()["id"]
    return fid, pa, pb


def _play_first_match(client, fid, pa, pb):
    assert client.post(f"{API}/fixtures/{fid}/start", timeout=30).status_code == 200
    assert client.post(f"{API}/fixtures/{fid}/rounds/1/start", timeout=30).status_code == 200
    det = client.get(f"{API}/fixtures/{fid}", timeout=30).json()
    mid = det["rounds"][0]["matches"][0]["id"]
    assert client.put(f"{API}/matches/{mid}",
                      json={"team_a_player_ids": pa, "team_b_player_ids": pb},
                      timeout=30).status_code == 200
    assert client.post(f"{API}/matches/{mid}/start", timeout=30).status_code == 200
    for _ in range(15):
        assert client.post(f"{API}/matches/{mid}/score", params={"side": "a"}, timeout=30).status_code == 200
    return mid


# ---------- known bug: PUT score edit crossing over does not flip winner ----------
class TestWinnerFlipOnScoreEdit:
    def test_put_score_crossover_does_not_flip_winner(self, client, maint):
        teams = client.get(f"{API}/teams", timeout=30).json()
        players = client.get(f"{API}/players", timeout=30).json()
        ta, tb = teams[0]["id"], teams[1]["id"]
        fid, pa, pb = _make_fixture(client, ta, tb, players, 91)
        try:
            mid = _play_first_match(client, fid, pa, pb)
            m = client.get(f"{API}/matches/{mid}", timeout=30).json()
            assert m["winner_team_id"] == ta and m["status"] == "completed"

            r = client.put(f"{API}/matches/{mid}", json={"score_a": 12, "score_b": 15}, timeout=30)
            assert r.status_code == 200, r.text[:300]
            after = r.json()
            print(f"after crossover edit: {after['score_a']}-{after['score_b']} "
                  f"winner={after['winner_team_id']} (team_a={ta}, team_b={tb})")
            assert after["score_a"] == 12 and after["score_b"] == 15
            # Correct behaviour: winner should now be team_b
            assert after["winner_team_id"] == tb, (
                "BUG: winner_team_id still points at the losing team after a crossover "
                "score edit (guard `status=='completed' and not winner_team_id` skips recompute)"
            )
        finally:
            client.delete(f"{API}/fixtures/{fid}", timeout=30)

    def test_restore_is_the_working_escape_hatch(self, client, maint):
        """Same crossover, corrected through /admin/restore instead of PUT."""
        teams = client.get(f"{API}/teams", timeout=30).json()
        players = client.get(f"{API}/players", timeout=30).json()
        ta, tb = teams[0]["id"], teams[1]["id"]
        fid, pa, pb = _make_fixture(client, ta, tb, players, 92)
        try:
            mid = _play_first_match(client, fid, pa, pb)
            snap = _backup(client, maint)
            matches = copy.deepcopy(snap["matches"])
            for m in matches:
                if m["id"] == mid:
                    m["score_a"], m["score_b"] = 12, 15
                    m["winner_team_id"] = tb
            r = client.post(f"{API}/admin/restore",
                            json={"matches": matches, "replace": True},
                            headers=maint, timeout=120)
            assert r.status_code == 200
            got = client.get(f"{API}/matches/{mid}", timeout=30).json()
            assert (got["score_a"], got["score_b"]) == (12, 15)
            assert got["winner_team_id"] == tb
            det = client.get(f"{API}/fixtures/{fid}", timeout=30).json()
            assert det["total_a"] == 12 and det["total_b"] == 15
        finally:
            client.delete(f"{API}/fixtures/{fid}", timeout=30)


# ---------- safety: partial matches list + replace=True destroys unrelated matches ----------
class TestPartialPayloadDataLoss:
    def test_matches_only_partial_list_wipes_other_matches(self, client, maint):
        teams = client.get(f"{API}/teams", timeout=30).json()
        players = client.get(f"{API}/players", timeout=30).json()
        f1, pa1, pb1 = _make_fixture(client, teams[0]["id"], teams[1]["id"], players, 93)
        f2, pa2, pb2 = _make_fixture(client, teams[2]["id"], teams[3]["id"], players, 94)
        snap = _backup(client, maint)
        try:
            f1_matches = [m for m in snap["matches"] if m["fixture_id"] == f1]
            f2_ids = [m["id"] for m in snap["matches"] if m["fixture_id"] == f2]
            assert f1_matches and f2_ids
            r = client.post(f"{API}/admin/restore",
                            json={"matches": copy.deepcopy(f1_matches), "replace": True},
                            headers=maint, timeout=120)
            assert r.status_code == 200
            after = _backup(client, maint)
            surviving = {m["id"] for m in after["matches"]}
            lost = [i for i in f2_ids if i not in surviving]
            print(f"partial restore: {len(lost)}/{len(f2_ids)} unrelated matches deleted; "
                  f"total matches {len(snap['matches'])} -> {len(after['matches'])}")
            assert not lost, (
                f"DATA LOSS: matches-only payload with replace=True deleted {len(lost)} "
                "unrelated match docs (fixture F2 emptied). Callers MUST send the full "
                "matches collection."
            )
        finally:
            client.post(f"{API}/admin/restore",
                        json={"matches": snap["matches"], "replace": True},
                        headers=maint, timeout=120)
            client.delete(f"{API}/fixtures/{f1}", timeout=30)
            client.delete(f"{API}/fixtures/{f2}", timeout=30)
            fin = _backup(client, maint)
            print(f"cleanup done: fixtures={len(fin['fixtures'])} matches={len(fin['matches'])}")
