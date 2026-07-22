"""Setup helper: create scheduled fixture, start fixture, start round 1, assign players.
Prints JSON with fixture_id, match_id, and referee token for Playwright test consumption.
Also usable for cleanup by passing --cleanup <fixture_id>.
"""
import json
import sys
import requests

BASE = "https://courtroom-stream.preview.emergentagent.com"
API = f"{BASE}/api"
T = 30


def login():
    r = requests.post(f"{API}/auth/referee/login", json={"pin": "9832"}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def cleanup(fixture_id, token):
    h = {"Authorization": f"Bearer {token}"}
    requests.delete(f"{API}/fixtures/{fixture_id}", headers=h, timeout=T)


def setup():
    token = login()
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    teams = requests.get(f"{API}/teams", timeout=T).json()
    team_a = next(t for t in teams if t["name"] == "SAMEER")
    team_b = next(t for t in teams if t["name"] == "PRATIK")
    payload = {
        "team_a_id": team_a["id"],
        "team_b_id": team_b["id"],
        "court_number": 10,
        "target_score": 5,
    }
    r = requests.post(f"{API}/fixtures", json=payload, headers=h, timeout=T)
    r.raise_for_status()
    fx = r.json()
    fid = fx["id"]
    # Start fixture
    requests.post(f"{API}/fixtures/{fid}/start", headers=h, timeout=T)
    # Start round 1
    requests.post(f"{API}/fixtures/{fid}/rounds/1/start", headers=h, timeout=T)
    # Get match 1
    fx = requests.get(f"{API}/fixtures/{fid}", timeout=T).json()
    m1 = fx["rounds"][0]["matches"][0]
    mid = m1["id"]
    # Assign 2 players per side
    players_a = [p["id"] for p in team_a["players"][:2]]
    players_b = [p["id"] for p in team_b["players"][:2]]
    requests.put(f"{API}/matches/{mid}", json={
        "team_a_player_ids": players_a,
        "team_b_player_ids": players_b,
    }, headers=h, timeout=T)
    return {"token": token, "fixture_id": fid, "match_id": mid,
            "team_a_name": team_a["name"], "team_b_name": team_b["name"]}


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cleanup":
        fid = sys.argv[2]
        cleanup(fid, login())
        print(json.dumps({"cleaned": fid}))
    else:
        print(json.dumps(setup()))
