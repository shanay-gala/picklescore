"""
Iteration 11 — PUT /api/players/{id} partial update (PlayerUpdate model).
Verifies omitted fields are NOT reset, empty body -> 400, is_captain preserved,
and full-body PUT remains backward compatible.
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

BASE_PLAYER = {"name": "TEST_PARTIAL", "contact": "9999999999", "age": 41, "category": "advance"}


def _pin():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing test_credentials.md")
    m = re.search(r"(?im)^\s*[-*]?\s*PIN:\s*`?(\d+)", p.read_text())
    if not m:
        pytest.skip("no referee PIN in test_credentials.md")
    return m.group(1)


@pytest.fixture(scope="module")
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


@pytest.fixture(scope="module")
def teams(client):
    r = client.get(f"{BASE_URL}/api/teams")
    assert r.status_code == 200
    t = r.json()
    assert len(t) >= 2, f"need >=2 teams, got {len(t)}"
    return t


@pytest.fixture(scope="module")
def created_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(client, created_ids):
    yield
    for pid in created_ids:
        client.delete(f"{BASE_URL}/api/players/{pid}")
    # paranoid sweep for any leftover TEST_ players
    for t in client.get(f"{BASE_URL}/api/teams").json():
        for p in client.get(f"{BASE_URL}/api/players?team_id={t['id']}").json():
            if p["name"].startswith("TEST_"):
                client.delete(f"{BASE_URL}/api/players/{p['id']}")


def _make(client, created_ids, team_id, **over):
    payload = dict(BASE_PLAYER, team_id=team_id, **over)
    r = client.post(f"{BASE_URL}/api/players", json=payload)
    assert r.status_code == 200, r.text
    p = r.json()
    created_ids.append(p["id"])
    assert p["category"] == payload["category"] and p["contact"] == payload["contact"]
    assert p["age"] == payload["age"]
    return p


def _get(client, team_id, pid):
    lst = client.get(f"{BASE_URL}/api/players?team_id={team_id}")
    assert lst.status_code == 200, lst.text
    return next((x for x in lst.json() if x["id"] == pid), None)


class TestPartialUpdate:
    def test_name_only_preserves_other_fields(self, client, teams, created_ids):
        team = teams[0]
        p = _make(client, created_ids, team["id"])
        r = client.put(f"{BASE_URL}/api/players/{p['id']}", json={"name": "TEST_PARTIAL_RENAMED"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "_id" not in d
        assert d["name"] == "TEST_PARTIAL_RENAMED"
        assert d["category"] == "advance", f"category reset: {d}"
        assert d["contact"] == "9999999999", f"contact reset: {d}"
        assert d["age"] == 41, f"age reset: {d}"
        assert d["team_id"] == team["id"]
        g = _get(client, team["id"], p["id"])
        assert g is not None
        assert (g["name"], g["category"], g["contact"], g["age"]) == (
            "TEST_PARTIAL_RENAMED", "advance", "9999999999", 41)

    def test_category_only_preserves_other_fields(self, client, teams, created_ids):
        team = teams[0]
        p = _make(client, created_ids, team["id"], name="TEST_PARTIAL_CAT")
        r = client.put(f"{BASE_URL}/api/players/{p['id']}", json={"category": "beginner"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["category"] == "beginner"
        assert d["name"] == "TEST_PARTIAL_CAT"
        assert d["contact"] == "9999999999"
        assert d["age"] == 41
        assert d["team_id"] == team["id"]
        g = _get(client, team["id"], p["id"])
        assert g["category"] == "beginner" and g["name"] == "TEST_PARTIAL_CAT"
        assert g["contact"] == "9999999999" and g["age"] == 41

    def test_team_id_only_moves_player(self, client, teams, created_ids):
        src, dst = teams[0], teams[1]
        p = _make(client, created_ids, src["id"], name="TEST_PARTIAL_MOVE")
        r = client.put(f"{BASE_URL}/api/players/{p['id']}", json={"team_id": dst["id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["team_id"] == dst["id"]
        assert d["name"] == "TEST_PARTIAL_MOVE"
        assert d["category"] == "advance"
        assert d["contact"] == "9999999999"
        assert d["age"] == 41
        # persisted on destination team, gone from source team
        assert _get(client, dst["id"], p["id"]) is not None
        assert _get(client, src["id"], p["id"]) is None

    def test_empty_body_returns_400(self, client, teams, created_ids):
        p = _make(client, created_ids, teams[0]["id"], name="TEST_PARTIAL_EMPTY")
        r = client.put(f"{BASE_URL}/api/players/{p['id']}", json={})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        assert "No fields to update" in r.text
        # nothing changed
        g = _get(client, teams[0]["id"], p["id"])
        assert g["name"] == "TEST_PARTIAL_EMPTY" and g["category"] == "advance"

    def test_all_nulls_body_returns_400(self, client, teams, created_ids):
        p = _make(client, created_ids, teams[0]["id"], name="TEST_PARTIAL_NULLS")
        r = client.put(f"{BASE_URL}/api/players/{p['id']}",
                       json={"name": None, "category": None, "contact": None, "age": None,
                             "team_id": None})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        g = _get(client, teams[0]["id"], p["id"])
        assert g["name"] == "TEST_PARTIAL_NULLS" and g["category"] == "advance"

    def test_full_body_put_still_works(self, client, teams, created_ids):
        team = teams[0]
        p = _make(client, created_ids, team["id"], name="TEST_PARTIAL_FULL")
        body = {"name": "TEST_PARTIAL_FULL2", "contact": "8888888888", "age": 22,
                "category": "intermediate", "team_id": teams[1]["id"]}
        r = client.put(f"{BASE_URL}/api/players/{p['id']}", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        for k, v in body.items():
            assert d[k] == v, f"{k} expected {v} got {d[k]}"
        g = _get(client, teams[1]["id"], p["id"])
        for k, v in body.items():
            assert g[k] == v

    def test_is_captain_preserved_on_partial_put(self, client, teams):
        """Existing seeded captain: no-op name PUT must not clear is_captain."""
        captain = None
        for t in teams:
            for pl in client.get(f"{BASE_URL}/api/players?team_id={t['id']}").json():
                if pl.get("is_captain"):
                    captain = pl
                    break
            if captain:
                break
        if not captain:
            pytest.skip("no seeded captain player found")
        before = dict(captain)
        r = client.put(f"{BASE_URL}/api/players/{captain['id']}",
                       json={"name": captain["name"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_captain"] is True, f"is_captain lost: {d}"
        for k in ("name", "contact", "age", "category", "team_id"):
            assert d[k] == before[k], f"{k} changed: {before[k]} -> {d[k]}"

    def test_update_nonexistent_player_404(self, client):
        r = client.put(f"{BASE_URL}/api/players/does-not-exist-xyz", json={"name": "TEST_X"})
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_unauthenticated_put_rejected(self, teams):
        r = requests.put(f"{BASE_URL}/api/players/anything", json={"name": "TEST_X"})
        assert r.status_code in (401, 403), f"got {r.status_code}"
