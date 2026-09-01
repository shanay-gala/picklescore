"""Force leaderboard to match offline "Point Table before Week 5".

User supplied per-team PF (points-for) values as of end of Week 4.
The app's leaderboard formula is:
    tournament_points = bonus_points + sum(score across all matches with scores)

Strategy:
  1. Compute each team's PF from matches whose fixture.week_number != 5
     (i.e., all matches BEFORE Week 5 including any completed match data).
  2. bonus_points = offline_target - pre_week5_pf
  3. Week 5's PF then adds naturally on top of the offline table.

Prints a plan and asks for confirmation via env var CONFIRM=1.
"""
import asyncio
import os
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "picklescore")

# name-in-db -> target PF as of end-of-Week-4 (per offline point table)
TARGETS = {
    "DEVEN":     675,
    "HEMIL":     670,
    "DHEER":     634,  # aka Dheer Gada
    "HETANKSH":  611,  # aka Hetanksh Ch
    "PRATIK":    594,  # aka Pratik Gala
    "PRATIK G":  552,  # aka Pratik Gada
    "PARTH":     642,
    "SIDDHARTH": 636,  # aka Siddhart
    "MANAN":     631,
    "MOHIK":     620,
    "KEVIN":     584,
    "URVIL":     569,
}


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    teams = await db.teams.find({}, {"_id": 0}).to_list(50)
    name_to_id = {t["name"]: t["id"] for t in teams}
    current_bonus = {t["id"]: int(t.get("bonus_points") or 0) for t in teams}

    # Which fixtures are Week 5?
    week5_fixture_ids = set()
    async for f in db.fixtures.find({"week_number": 5}, {"_id": 0, "id": 1}):
        week5_fixture_ids.add(f["id"])
    print(f"Week 5 fixtures: {len(week5_fixture_ids)}")

    # Compute PF per team, splitting by pre-Week-5 vs Week-5
    pf_pre = {t["id"]: 0 for t in teams}
    pf_w5  = {t["id"]: 0 for t in teams}
    async for m in db.matches.find(
        {},
        {"_id": 0, "score_a": 1, "score_b": 1, "status": 1,
         "team_a_id": 1, "team_b_id": 1, "fixture_id": 1},
    ):
        sa, sb = int(m.get("score_a") or 0), int(m.get("score_b") or 0)
        if sa == 0 and sb == 0 and m.get("status") != "completed":
            continue
        bucket = pf_w5 if m.get("fixture_id") in week5_fixture_ids else pf_pre
        a, b = m["team_a_id"], m["team_b_id"]
        if a in bucket:
            bucket[a] += sa
        if b in bucket:
            bucket[b] += sb

    print(f"\n{'Team':<12} {'Target':>7} {'PF pre':>7} {'PF W5':>6} {'CurBonus':>9} {'NewBonus':>9} {'FinalPTS':>9}")
    print("-" * 68)

    plan = []  # (team_id, new_bonus)
    for name, target in TARGETS.items():
        tid = name_to_id.get(name)
        if not tid:
            print(f"!! Team '{name}' NOT FOUND — skipping")
            continue
        pre = pf_pre[tid]
        w5  = pf_w5[tid]
        cur = current_bonus[tid]
        new_bonus = target - pre           # so that target = pre + new_bonus (leaderboard PTS w/o W5)
        final_pts = target + w5             # after adding W5's PF naturally
        plan.append((tid, name, new_bonus))
        print(f"{name:<12} {target:>7} {pre:>7} {w5:>6} {cur:>9} {new_bonus:>9} {final_pts:>9}")

    if os.environ.get("CONFIRM") != "1":
        print("\nDRY RUN. Re-run with CONFIRM=1 to apply.")
        client.close()
        return

    print("\nApplying bonus_points updates...")
    for tid, name, new_bonus in plan:
        await db.teams.update_one({"id": tid}, {"$set": {"bonus_points": int(new_bonus)}})
        print(f"  {name} -> bonus_points = {new_bonus}")
    print("Done.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
