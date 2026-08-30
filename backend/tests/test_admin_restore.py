"""
Iteration 12 — /admin/restore invariants (backend only, preview URL).

Covers:
  * auth guard on POST /api/admin/restore (no token / wrong token / correct token)
  * matches-only payload with replace=True preserves every match id
  * leaderboard math after a direct match doc rewrite (score swap)
  * fixture total_a/total_b == sum of its match scores after rewrite
  * idempotency (same payload twice -> identical DB state)
  * replace=False duplication behaviour (documented risk)
  * production data check: MANAN vs MOHIK R2M2 == 15-12 with correct winner

MUST be run serially:  pytest -n 0 /app/backend/tests/test_admin_restore.py
Teardown fully restores the pre-test snapshot taken at module setup.
"""
import copy
import json
import os
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

MAINT_TOKEN = "restore-9832-picklewave"
REF_PIN = "9832"
SNAPSHOT_PATH = Path("/app/test_reports/pytest/iter12_pretest_snapshot.json")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/referee/login", json={"pin": REF_PIN}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Referee login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def maint():
    return {"X-Maint-Token": MAINT_TOKEN}


@pytest.fixture(scope="module", autouse=True)
def snapshot(client, maint):
    """Take a full backup before anything, restore it afterwards."""
    r = client.get(f"{API}/admin/backup", headers=maint, timeout=60)
    assert r.status_code == 200, f"backup failed {r.status_code}: {r.text[:300]}"
    snap = r.json()
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(snap))
    print(
        "PRE-TEST SNAPSHOT: teams=%d players=%d fixtures=%d matches=%d"
        % (len(snap["teams"]), len(snap["players"]), len(snap["fixtures"]), len(snap["matches"]))
    )
    yield snap
    # ---- teardown: hard restore original state ----
    payload = {
        "teams": snap["teams"],
        "players": snap["players"],
        "fixtures": snap["fixtures"],
        "matches": snap["matches"],
        "replace": True,
    }
    rr = client.post(f"{API}/admin/restore", json=payload, headers=maint, timeout=120)
    assert rr.status_code == 200, f"TEARDOWN RESTORE FAILED: {rr.status_code} {rr.text[:300]}"
    after = client.get(f"{API}/admin/backup", headers=maint, timeout=60).json()
    print(
        "POST-TEST STATE: teams=%d players=%d fixtures=%d matches=%d"
        % (len(after["teams"]), len(after["players"]), len(after["fixtures"]), len(after["matches"]))
    )
    assert len(after["matches"]) == len(snap["matches"])
    assert len(after["fixtures"]) == len(snap["fixtures"])
    assert len(after["players"]) == len(snap["players"])
    assert len(after["teams"]) == len(snap["teams"])


def _backup(client, maint):
    r = client.get(f"{API}/admin/backup", headers=maint, timeout=60)
    assert r.status_code == 200
    return r.json()


def _lb_row(client, team_id):
    rows = client.get(f"{API}/leaderboard", timeout=30).json()
    row = next((x for x in rows if x["team_id"] == team_id), None)
    assert row is not None, f"team {team_id} missing from leaderboard"
    return row


# ---------- module: auth guard on maintenance endpoints ----------
class TestMaintAuth:
    def test_restore_without_token_401(self):
        r = requests.post(f"{API}/admin/restore", json={"replace": False}, timeout=30)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_restore_wrong_token_401(self):
        r = requests.post(
            f"{API}/admin/restore",
            json={"replace": False},
            headers={"X-Maint-Token": "totally-wrong"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_backup_without_token_401(self):
        r = requests.get(f"{API}/admin/backup", timeout=30)
        assert r.status_code == 401

    def test_restore_correct_token_noop_200(self, client, maint):
        """All collections None -> nothing touched, 200 with empty summary."""
        before = _backup(client, maint)
        r = client.post(f"{API}/admin/restore", json={"replace": True}, headers=maint, timeout=60)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["ok"] is True
        assert body["restored"] == {}
        after = _backup(client, maint)
        assert len(after["matches"]) == len(before["matches"])
        assert len(after["teams"]) == len(before["teams"])


# ---------- module: production data correction check ----------
class TestProdDataCorrection:
    def test_manan_vs_mohik_r2m2_scores(self, client, maint):
        snap = _backup(client, maint)
        teams = {t["id"]: t["name"] for t in snap["teams"]}
        manan = next((tid for tid, n in teams.items() if "MANAN" in n.upper()), None)
        mohik = next((tid for tid, n in teams.items() if "MOHIK" in n.upper()), None)
        if not manan or not mohik:
            pytest.skip("MANAN / MOHIK teams not present in preview data")
        fx = [
            f for f in snap["fixtures"]
            if {f["team_a_id"], f["team_b_id"]} == {manan, mohik}
        ]
        assert fx, "no MANAN vs MOHIK fixture found"
        target = None
        for f in fx:
            for m in snap["matches"]:
                if m["fixture_id"] == f["id"] and m["round_number"] == 2 and m["match_number"] == 2:
                    target = (f, m)
        assert target, "R2M2 match not found"
        f, m = target
        # normalise orientation to MANAN score / MOHIK score
        manan_score = m["score_a"] if m["team_a_id"] == manan else m["score_b"]
        mohik_score = m["score_b"] if m["team_a_id"] == manan else m["score_a"]
        print(f"R2M2 MANAN={manan_score} MOHIK={mohik_score} winner={m.get('winner_team_id')}")
        assert (manan_score, mohik_score) == (15, 12), (
            f"expected MANAN 15 / MOHIK 12, got {manan_score}/{mohik_score}"
        )
        assert m.get("winner_team_id") == manan, (
            f"winner_team_id should be MANAN ({manan}), got {m.get('winner_team_id')}"
        )
        assert m.get("status") == "completed"


# ---------- module: ad-hoc fixture -> score -> restore rewrite ----------
class TestRestoreLeaderboardMath:
    @pytest.fixture(scope="class")
    def scenario(self, client, maint):
        """Create TEST_ fixture, play one match to completion, return ids."""
        teams = client.get(f"{API}/teams", timeout=30).json()
        assert len(teams) >= 2
        ta, tb = teams[0], teams[1]
        players = client.get(f"{API}/players", timeout=30).json()
        pa = [p["id"] for p in players if p["team_id"] == ta["id"]][:2]
        pb = [p["id"] for p in players if p["team_id"] == tb["id"]][:2]
        assert len(pa) >= 1 and len(pb) >= 1, "teams need players"

        r = client.post(
            f"{API}/fixtures",
            json={
                "team_a_id": ta["id"],
                "team_b_id": tb["id"],
                "court_number": 9,
                "scheduled_at": None,
                "target_score": 15,
            },
            timeout=30,
        )
        assert r.status_code in (200, 201), f"fixture create failed: {r.status_code} {r.text[:300]}"
        fx = r.json()
        fid = fx["id"]
        assert client.post(f"{API}/fixtures/{fid}/start", timeout=30).status_code == 200
        assert client.post(f"{API}/fixtures/{fid}/rounds/1/start", timeout=30).status_code == 200
        detail = client.get(f"{API}/fixtures/{fid}", timeout=30).json()
        mid = detail["rounds"][0]["matches"][0]["id"]
        assert client.put(
            f"{API}/matches/{mid}",
            json={"team_a_player_ids": pa, "team_b_player_ids": pb},
            timeout=30,
        ).status_code == 200
        assert client.post(f"{API}/matches/{mid}/start", timeout=30).status_code == 200
        for _ in range(15):
            sr = client.post(f"{API}/matches/{mid}/score", params={"side": "a"}, timeout=30)
            assert sr.status_code == 200, sr.text[:200]
        for _ in range(0):
            pass
        m = client.get(f"{API}/matches/{mid}", timeout=30).json()
        assert m["status"] == "completed"
        assert m["score_a"] == 15 and m["score_b"] == 0
        assert m["winner_team_id"] == ta["id"]
        yield {"fixture_id": fid, "match_id": mid, "team_a": ta["id"], "team_b": tb["id"]}
        client.delete(f"{API}/fixtures/{fid}", timeout=30)

    def test_score_swap_via_restore_updates_leaderboard_and_ids(self, client, maint, scenario):
        mid = scenario["match_id"]
        ta, tb = scenario["team_a"], scenario["team_b"]

        lb_a_before = _lb_row(client, ta)
        lb_b_before = _lb_row(client, tb)

        snap = _backup(client, maint)
        ids_before = sorted(m["id"] for m in snap["matches"])
        matches = copy.deepcopy(snap["matches"])
        found = False
        for m in matches:
            if m["id"] == mid:
                m["score_a"], m["score_b"] = m["score_b"], m["score_a"]  # 15-0 -> 0-15
                m["winner_team_id"] = m["team_b_id"]
                m["status"] = "completed"
                found = True
        assert found

        r = client.post(
            f"{API}/admin/restore",
            json={"matches": matches, "replace": True},
            headers=maint,
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json()["restored"] == {"matches": len(matches)}

        # --- ids preserved, no cascade loss ---
        after = _backup(client, maint)
        assert sorted(m["id"] for m in after["matches"]) == ids_before, "match ids not preserved"
        assert len(after["teams"]) == len(snap["teams"]), "teams clobbered by matches-only restore"
        assert len(after["players"]) == len(snap["players"]), "players clobbered"
        assert len(after["fixtures"]) == len(snap["fixtures"]), "fixtures clobbered"

        # --- rewritten doc correct ---
        m2 = client.get(f"{API}/matches/{mid}", timeout=30).json()
        assert (m2["score_a"], m2["score_b"]) == (0, 15)
        assert m2["winner_team_id"] == tb
        assert m2["status"] == "completed"

        # --- leaderboard delta: A loses 15 pts, B gains 15 pts ---
        lb_a_after = _lb_row(client, ta)
        lb_b_after = _lb_row(client, tb)
        assert lb_a_after["tournament_points"] == lb_a_before["tournament_points"] - 15, (
            f"A pts {lb_a_before['tournament_points']} -> {lb_a_after['tournament_points']}"
        )
        assert lb_b_after["tournament_points"] == lb_b_before["tournament_points"] + 15
        assert lb_a_after["points_for"] == lb_a_before["points_for"] - 15
        assert lb_a_after["points_against"] == lb_a_before["points_against"] + 15
        assert lb_a_after["match_wins"] == lb_a_before["match_wins"] - 1
        assert lb_b_after["match_wins"] == lb_b_before["match_wins"] + 1
        assert lb_a_after["matches_played"] == lb_a_before["matches_played"]

        # --- fixture totals == sum of matches ---
        fdet = client.get(f"{API}/fixtures/{scenario['fixture_id']}", timeout=30).json()
        ms = [m for m in after["matches"] if m["fixture_id"] == scenario["fixture_id"]]
        assert fdet["total_a"] == sum(x["score_a"] for x in ms) == 0
        assert fdet["total_b"] == sum(x["score_b"] for x in ms) == 15

    def test_restore_is_idempotent(self, client, maint, scenario):
        snap = _backup(client, maint)
        payload = {"matches": copy.deepcopy(snap["matches"]), "replace": True}
        first = client.post(f"{API}/admin/restore", json=payload, headers=maint, timeout=120)
        assert first.status_code == 200
        state1 = sorted(_backup(client, maint)["matches"], key=lambda d: d["id"])
        second = client.post(f"{API}/admin/restore", json=payload, headers=maint, timeout=120)
        assert second.status_code == 200
        state2 = sorted(_backup(client, maint)["matches"], key=lambda d: d["id"])
        assert len(state1) == len(state2) == len(snap["matches"]), "doc count changed across restores"
        assert [d["id"] for d in state1] == [d["id"] for d in state2]
        assert state1 == state2, "restore is not idempotent (doc content drifted)"

    def test_replace_false_duplicates_docs(self, client, maint, scenario):
        """Documented risk: replace=False appends, creating duplicate match ids."""
        snap = _backup(client, maint)
        one = [copy.deepcopy(next(m for m in snap["matches"] if m["id"] == scenario["match_id"]))]
        r = client.post(
            f"{API}/admin/restore",
            json={"matches": one, "replace": False},
            headers=maint,
            timeout=60,
        )
        assert r.status_code == 200
        after = _backup(client, maint)
        dupes = [m for m in after["matches"] if m["id"] == scenario["match_id"]]
        print(f"replace=False -> {len(dupes)} docs share match id (no unique index on id)")
        # cleanup: put the collection back the way it was
        fix = client.post(
            f"{API}/admin/restore",
            json={"matches": snap["matches"], "replace": True},
            headers=maint,
            timeout=120,
        )
        assert fix.status_code == 200
        assert len(_backup(client, maint)["matches"]) == len(snap["matches"])
        assert len(dupes) == 1, (
            f"replace=False created {len(dupes)} duplicate docs for match id "
            f"{scenario['match_id']} — no unique index on `id`"
        )
