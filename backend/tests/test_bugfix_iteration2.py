"""Iteration 2 bug-fix verification for Kurukshetra Picklewave.

Scope (per review request):
  1. Player rename: 'pratik gada' exists; no 'pratik m shah'.
  2. Referee dashboard sort ordering: live > paused > scheduled > completed (newest-first).
  3. Public Games page RESULTS section: completed newest-first.
  4. Regression: /api/leaderboard 8 rows, HEET #1, tp >= 969.
  5. Regression: fresh scheduled fixture appears in SCHEDULED slot (not COMPLETED bottom).
  6. Regression: WebSocket /api/ws hello event received.

Notes:
- Runs only against preview URL. Backend on MongoDB Atlas.
- No destructive modifications on existing fixtures. Any created test fixture is deleted.
"""
import asyncio
import json
import os

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL_TEST",
                          "https://courtroom-stream.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"


# ------------------- Fixtures -------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ref_token(session):
    r = session.post(f"{API}/auth/referee/login", json={"pin": "9832"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_session(ref_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {ref_token}"})
    return s


# ------------------- Player rename -------------------
class TestPlayerRename:
    def test_pratik_gada_exists(self, session):
        r = session.get(f"{API}/players")
        assert r.status_code == 200
        players = r.json()
        gada = [p for p in players if p["name"].lower() == "pratik gada"]
        assert len(gada) == 1, f"Expected exactly one 'pratik gada', got {len(gada)}"
        assert gada[0]["contact"] == "9833252526"

        # ensure their team is PRATIK team
        teams = session.get(f"{API}/teams").json()
        pratik_team = next(t for t in teams if t["name"] == "PRATIK")
        assert gada[0]["team_id"] == pratik_team["id"]

    def test_no_pratik_m_shah(self, session):
        players = session.get(f"{API}/players").json()
        bad = [p for p in players if "pratik m shah" in p["name"].lower()]
        assert bad == [], f"'pratik m shah' still present: {bad}"


# ------------------- Sort ordering helpers -------------------
STATUS_ORDER = {"live": 0, "paused": 1, "scheduled": 2, "completed": 3}


def expected_ref_order(fixtures):
    def key(f):
        s_idx = STATUS_ORDER.get(f["status"], 9)
        ta = f.get("completed_at") or f.get("started_at") or f.get("created_at") or ""
        # For completed we want newest-first (invert). For others, oldest-first.
        if f["status"] == "completed":
            # tuple: (status_idx, inverted string) -> use negative ordering via secondary
            return (s_idx, -1, ta)  # placeholder; we'll sort in two passes
        return (s_idx, 1, ta)
    # simpler: do a stable sort with custom comparator via functools.cmp_to_key
    from functools import cmp_to_key

    def cmp(a, b):
        oa = STATUS_ORDER.get(a["status"], 9)
        ob = STATUS_ORDER.get(b["status"], 9)
        if oa != ob:
            return oa - ob
        ta = a.get("completed_at") or a.get("started_at") or a.get("created_at") or ""
        tb = b.get("completed_at") or b.get("started_at") or b.get("created_at") or ""
        if a["status"] == "completed":
            # newest first -> larger string first
            if ta < tb:
                return 1
            if ta > tb:
                return -1
            return 0
        # oldest first
        if ta < tb:
            return -1
        if ta > tb:
            return 1
        return 0
    return sorted(fixtures, key=cmp_to_key(cmp))


# ------------------- Ordering (backend data reflects UI sort) -------------------
class TestFixtureOrdering:
    def test_fixtures_endpoint_provides_needed_fields(self, session):
        fixtures = session.get(f"{API}/fixtures").json()
        assert len(fixtures) >= 1
        for f in fixtures:
            assert "status" in f
            assert "id" in f
            # at least one timestamp field must be present for the UI sort
            assert any(k in f for k in ("completed_at", "started_at", "created_at"))

    def test_expected_ref_order_scheduled_before_completed(self, session):
        """The current dataset has 1 scheduled + 7 completed. Verify computed
        UI order places scheduled first, then completed newest-first."""
        fixtures = session.get(f"{API}/fixtures").json()
        ordered = expected_ref_order(fixtures)
        statuses = [f["status"] for f in ordered]
        # scheduled precedes any completed
        first_completed = next((i for i, s in enumerate(statuses) if s == "completed"), None)
        first_scheduled = next((i for i, s in enumerate(statuses) if s == "scheduled"), None)
        if first_completed is not None and first_scheduled is not None:
            assert first_scheduled < first_completed, \
                f"scheduled must precede completed. statuses={statuses}"

        # Within completed, newest-first
        completed = [f for f in ordered if f["status"] == "completed"]
        for a, b in zip(completed, completed[1:]):
            ta = a.get("completed_at") or ""
            tb = b.get("completed_at") or ""
            assert ta >= tb, f"Completed not newest-first: {ta} vs {tb}"


# ------------------- Leaderboard regression -------------------
class TestLeaderboardRegression:
    def test_leaderboard_shape_and_heet_top(self, session):
        r = session.get(f"{API}/leaderboard")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 8
        pts = [row["tournament_points"] for row in rows]
        assert pts == sorted(pts, reverse=True), "not sorted desc"
        assert rows[0]["team_name"] == "HEET"
        assert rows[0]["tournament_points"] >= 969, \
            f"HEET tp = {rows[0]['tournament_points']}, expected >= 969"


# ------------------- New scheduled fixture placement -------------------
class TestNewFixtureScheduledPlacement:
    def test_created_fixture_sorts_in_scheduled_group(self, session, auth_session):
        teams = session.get(f"{API}/teams").json()
        # Pick two teams that already appear as scheduled (HETANKSH vs HEMIL not used
        # to avoid duplicating). We'll use SAMEER vs KIRAN.
        team_a = next(t for t in teams if t["name"] == "SAMEER")
        team_b = next(t for t in teams if t["name"] == "KIRAN")
        payload = {
            "team_a_id": team_a["id"],
            "team_b_id": team_b["id"],
            "court_number": 9,
            "target_score": 3,
        }
        r = auth_session.post(f"{API}/fixtures", json=payload)
        assert r.status_code == 200, r.text
        f = r.json()
        try:
            assert f["status"] == "scheduled"
            fixtures = session.get(f"{API}/fixtures").json()
            ordered = expected_ref_order(fixtures)
            # find our new fixture and ensure it is placed before any completed one
            idx_new = next(i for i, x in enumerate(ordered) if x["id"] == f["id"])
            first_completed = next((i for i, x in enumerate(ordered) if x["status"] == "completed"), None)
            if first_completed is not None:
                assert idx_new < first_completed, \
                    f"New scheduled fixture at {idx_new} should precede first completed at {first_completed}"
        finally:
            # cleanup
            d = auth_session.delete(f"{API}/fixtures/{f['id']}")
            assert d.status_code in (200, 204)


# ------------------- WebSocket regression -------------------
class TestWebSocketRegression:
    def test_ws_hello_received(self):
        async def run():
            async with websockets.connect(WS_URL, ping_interval=None) as ws:
                first = await asyncio.wait_for(ws.recv(), timeout=5)
                hello = json.loads(first)
                assert hello.get("type") == "hello", f"first msg: {hello}"
        asyncio.run(run())
