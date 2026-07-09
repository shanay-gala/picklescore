"""PickleScore - Pickleball Tournament Live Scoring backend.

Fixture-based hierarchy:
  Tournament -> Fixtures -> 4 Rounds x 3 Matches each -> 2v2 Match
  Tournament leaderboard aggregates POINTS scored across every match.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr
from starlette.middleware.cors import CORSMiddleware


# ---------- Config ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "picklescore")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
TOKEN_TTL_MIN = 60 * 24 * 7

ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_DEFAULT_PASSWORD = os.environ["ADMIN_DEFAULT_PASSWORD"]
REFEREE_DEFAULT_PIN = os.environ["REFEREE_DEFAULT_PIN"]

ROUNDS_PER_FIXTURE = 4
MATCHES_PER_ROUND = 3
TOURNAMENT_START_WEEK = 5

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
log = logging.getLogger("picklescore")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
users_col = db.users
teams_col = db.teams
players_col = db.players
fixtures_col = db.fixtures
matches_col = db.matches


def hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_pw(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------- Pydantic models ----------
class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class RefereeLogin(BaseModel):
    pin: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    name: Optional[str] = None


class TeamIn(BaseModel):
    name: str
    captain_name: Optional[str] = ""


class PlayerIn(BaseModel):
    name: str
    contact: Optional[str] = ""
    age: Optional[int] = None
    category: Optional[str] = "beginner"
    team_id: str


class FixtureCreate(BaseModel):
    team_a_id: str
    team_b_id: str
    court_number: int = 1
    scheduled_at: Optional[str] = None
    target_score: int = 15


class FixtureUpdate(BaseModel):
    court_number: Optional[int] = None
    scheduled_at: Optional[str] = None


class MatchUpdate(BaseModel):
    team_a_player_ids: Optional[list[str]] = None
    team_b_player_ids: Optional[list[str]] = None
    target_score: Optional[int] = None
    score_a: Optional[int] = None
    score_b: Optional[int] = None
    status: Optional[str] = None


class RefereeCreate(BaseModel):
    name: str
    pin: str


# ---------- JWT ----------
def make_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=TOKEN_TTL_MIN)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/admin/login", auto_error=False)


async def current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> dict:
    if not token:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = await users_col.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_role(*roles: str):
    async def _checker(user: dict = Depends(current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(403, "Forbidden")
        return user
    return _checker


# ---------- WS hub ----------
class WSHub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self.clients.discard(ws)

    async def broadcast(self, payload: dict) -> None:
        async with self._lock:
            stale: list[WebSocket] = []
            for ws in self.clients:
                try:
                    await ws.send_json(payload)
                except Exception:
                    stale.append(ws)
            for ws in stale:
                self.clients.discard(ws)


hub = WSHub()


# ---------- Seed ----------
SEED_TEAMS = [
    {"name": "SAMEER", "captain": "sameer deepak chheda", "players": [
        ("dheer gada", "7045111081", 20, "beginner"),
        ("krishit karia", "9137228449", 18, "advance"),
        ("devansh sanjay savla", "9324288556", 23, "beginner"),
        ("mayur shantilal faria", "9372160047", 34, "beginner"),
        ("sameer deepak chheda", "9820447768", 30, "advance"),
        ("deep dhiraj shah", "8080577776", 28, "beginner"),
    ]},
    {"name": "KIRAN", "captain": "kiran maganlal chheda", "players": [
        ("jay haresh gala", "9870799606", 32, "beginner"),
        ("kiran maganlal chheda", "9930053937", 43, "advance"),
        ("devarya mukesh shah", "7718011112", 25, "beginner"),
        ("krushik gala", "8767066990", 32, "beginner"),
        ("kevin jayesh shah", "9833302200", 26, "advance"),
        ("zeal haresh karia", "9821549345", 27, "beginner"),
    ]},
    {"name": "HETANKSH", "captain": "hetanksh chheda", "players": [
        ("jainam narendra gada", "9867242409", 26, "beginner"),
        ("smit shailesh gada", "9082279530", 24, "advance"),
        ("romil r chheda", "9930543054", 29, "beginner"),
        ("ravi mansukh shah", "9769349320", 33, "beginner"),
        ("hetanksh chheda", "9819652420", 27, "advance"),
        ("Harshil Gindra", "8356058687", 23, "beginner"),
    ]},
    {"name": "URVIL", "captain": "urvil khutiya", "players": [
        ("bhavin satra", "9321155159", 37, "beginner"),
        ("manan navin shah", "9833030320", 29, "advance"),
        ("hridhaan karia", "8591446982", 15, "beginner"),
        ("daksh nilesh savla", "9819673550", 20, "beginner"),
        ("urvil khutiya", "8082027775", 31, "advance"),
        ("Nayan Rita", "7045422390", 22, "beginner"),
    ]},
    {"name": "SIDDHARTH", "captain": "siddharth gada", "players": [
        ("pranay jayantilal nisar", "9820314606", 30, "beginner"),
        ("hiten pravin khirani", "9819117722", 48, "advance"),
        ("yug manoj chheda", "9967875565", 24, "beginner"),
        ("mitesh karia", "9819272009", 41, "beginner"),
        ("siddharth gada", "9619154785", 29, "advance"),
        ("bhavin gala", "9892910997", 36, "beginner"),
    ]},
    {"name": "PRATIK", "captain": "pratik gala", "players": [
        ("smit chaadwa", "8356808959", 22, "beginner"),
        ("mohik hiten khirani", "9768633786", 21, "advance"),
        ("vatsal shah", "9820242428", 25, "beginner"),
        ("pratik m shah", "9833252526", 33, "beginner"),
        ("pratik gala", "9967243500", 29, "advance"),
        ("deepan dagha", "9821271190", 27, "beginner"),
    ]},
    {"name": "HEET", "captain": "heet navin chheda", "players": [
        ("shanay gala", "9821242079", 23, "beginner"),
        ("deven urmarshi rita", "9821733976", 44, "advance"),
        ("heet navin chheda", "9820113263", 28, "advance"),
        ("ayush gada", "9930063677", 27, "beginner"),
        ("Vansh Vinod Chheda", "7738227171", 21, "beginner"),
        ("Yugam Dedhia", "8169401782", 21, "beginner"),
    ]},
    {"name": "HEMIL", "captain": "hemil shah", "players": [
        ("hetvik gala", "9619925722", 23, "beginner"),
        ("hemil shah", "7977441859", 27, "advance"),
        ("jainam arvind gada", "8928893095", 20, "beginner"),
        ("suken chheda", "9324093243", 25, "beginner"),
        ("Nikunj Karia", "9819588885", 38, "beginner"),
        ("Parth Ramnik Charla", "9819656677", 35, "advance"),
    ]},
]


async def seed_initial() -> None:
    now = datetime.now(timezone.utc).isoformat()

    legacy = await matches_col.count_documents({"fixture_id": {"$exists": False}})
    if legacy:
        await matches_col.delete_many({"fixture_id": {"$exists": False}})
        log.info("Dropped %d legacy matches without fixture_id", legacy)

    async for t in teams_col.find({"name": {"$regex": r"^TEAM\s+", "$options": "i"}}):
        clean = t["name"].split(None, 1)[1] if len(t["name"].split(None, 1)) > 1 else t["name"]
        await teams_col.update_one({"id": t["id"]}, {"$set": {"name": clean.upper()}})
        log.info("Renamed team '%s' -> '%s'", t["name"], clean.upper())

    await fixtures_col.update_many(
        {"week_number": {"$exists": False}},
        {"$set": {"week_number": TOURNAMENT_START_WEEK}},
    )

    BASELINE_POINTS = {
        "HEET": 634, "KIRAN": 609, "HEMIL": 609, "URVIL": 595,
        "SIDDHARTH": 588, "HETANKSH": 582, "SAMEER": 546, "PRATIK": 545,
    }
    for tname, pts in BASELINE_POINTS.items():
        await teams_col.update_one({"name": tname}, {"$set": {"bonus_points": pts}})

    if not await users_col.find_one({"email": ADMIN_EMAIL, "role": "admin"}):
        await users_col.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "password_hash": hash_pw(ADMIN_DEFAULT_PASSWORD),
            "role": "admin",
            "name": "Tournament Admin",
            "created_at": now,
        })
        log.info("Seeded admin %s", ADMIN_EMAIL)

    if not await users_col.find_one({"role": "referee", "name": "Referee 1"}):
        await users_col.insert_one({
            "id": str(uuid.uuid4()),
            "role": "referee",
            "name": "Referee 1",
            "pin_hash": hash_pw(REFEREE_DEFAULT_PIN),
            "created_at": now,
        })
        log.info("Seeded referee PIN=%s", REFEREE_DEFAULT_PIN)
    else:
        await users_col.update_one(
            {"role": "referee", "name": "Referee 1"},
            {"$set": {"pin_hash": hash_pw(REFEREE_DEFAULT_PIN)}},
        )

    if await teams_col.count_documents({}) == 0:
        for t in SEED_TEAMS:
            team_id = str(uuid.uuid4())
            await teams_col.insert_one({
                "id": team_id, "name": t["name"], "captain_name": t["captain"], "created_at": now,
            })
            for (pname, contact, age, cat) in t["players"]:
                await players_col.insert_one({
                    "id": str(uuid.uuid4()),
                    "name": pname, "contact": contact, "age": age, "category": cat,
                    "team_id": team_id,
                    "is_captain": pname.strip().lower() == t["captain"].strip().lower(),
                    "created_at": now,
                })
        log.info("Seeded %d teams", len(SEED_TEAMS))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_initial()
    yield
    client.close()


app = FastAPI(title="PickleScore", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
api = APIRouter(prefix="/api")


# ---------- Helpers ----------
async def compute_current_week() -> int:
    total_teams = await teams_col.count_documents({})
    if total_teams == 0:
        return TOURNAMENT_START_WEEK
    w = TOURNAMENT_START_WEEK
    while True:
        played: set[str] = set()
        async for f in fixtures_col.find({"week_number": w, "status": "completed"}, {"_id": 0}):
            played.add(f["team_a_id"])
            played.add(f["team_b_id"])
        if len(played) < total_teams:
            return w
        w += 1
        if w > TOURNAMENT_START_WEEK + 200:
            return w


async def get_team(team_id: str) -> dict:
    t = await teams_col.find_one({"id": team_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Team not found")
    return t


async def hydrate_match(m: dict) -> dict:
    m = {k: v for k, v in m.items() if k != "_id"}
    pa = await players_col.find(
        {"id": {"$in": m.get("team_a_player_ids", [])}}, {"_id": 0}
    ).to_list(10)
    pb = await players_col.find(
        {"id": {"$in": m.get("team_b_player_ids", [])}}, {"_id": 0}
    ).to_list(10)
    m["team_a_players"] = pa
    m["team_b_players"] = pb
    return m


async def fixture_summary(f: dict, include_matches: bool = False) -> dict:
    f = {k: v for k, v in f.items() if k != "_id"}
    a = await teams_col.find_one({"id": f["team_a_id"]}, {"_id": 0})
    b = await teams_col.find_one({"id": f["team_b_id"]}, {"_id": 0})
    f["team_a_name"] = a["name"] if a else "?"
    f["team_b_name"] = b["name"] if b else "?"

    ms = await matches_col.find({"fixture_id": f["id"]}, {"_id": 0}).sort([("round_number", 1), ("match_number", 1)]).to_list(50)
    total_a = sum(m.get("score_a", 0) for m in ms)
    total_b = sum(m.get("score_b", 0) for m in ms)
    completed = sum(1 for m in ms if m.get("status") == "completed")
    live = sum(1 for m in ms if m.get("status") == "live")
    total = len(ms)

    f.setdefault("status", "scheduled")
    f.setdefault("rounds", [])
    f.setdefault("week_number", TOURNAMENT_START_WEEK)
    f["total_a"] = total_a
    f["total_b"] = total_b
    f["matches_total"] = total
    f["matches_completed"] = completed
    f["matches_live"] = live
    f["winner_team_id"] = None
    if f["status"] == "completed":
        f["winner_team_id"] = f["team_a_id"] if total_a > total_b else (f["team_b_id"] if total_b > total_a else None)

    if include_matches:
        rounds_meta = {r["round_number"]: r for r in f.get("rounds", [])}
        rounds_data: dict[int, list[dict]] = {}
        for m in ms:
            r = m["round_number"]
            rounds_data.setdefault(r, []).append(await hydrate_match(m))
        f["rounds"] = [
            {
                **rounds_meta.get(r, {"round_number": r, "status": "scheduled", "started_at": None, "completed_at": None}),
                "matches": rounds_data[r],
                "total_a": sum(m.get("score_a", 0) for m in rounds_data[r]),
                "total_b": sum(m.get("score_b", 0) for m in rounds_data[r]),
            }
            for r in sorted(rounds_data.keys())
        ]
    return f


# ---------- Health ----------
@api.get("/")
async def root():
    return {"app": "PickleScore", "status": "ok"}


@api.get("/health")
async def health():
    return {"ok": True, "ts": datetime.now(timezone.utc).isoformat()}


@api.get("/tournament/status")
async def tournament_status():
    return {
        "current_week": await compute_current_week(),
        "start_week": TOURNAMENT_START_WEEK,
    }


# ---------- Auth ----------
@api.post("/auth/admin/login", response_model=TokenOut)
async def admin_login(body: AdminLogin):
    user = await users_col.find_one({"email": body.email.lower(), "role": "admin"})
    if not user:
        user = await users_col.find_one({"email": body.email, "role": "admin"})
    if not user or not check_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid admin credentials")
    return TokenOut(access_token=make_token(user["id"], "admin"), role="admin",
                    user_id=user["id"], name=user.get("name"))


@api.post("/auth/referee/login", response_model=TokenOut)
async def referee_login(body: RefereeLogin):
    pin = body.pin.strip()
    if len(pin) != 4 or not pin.isdigit():
        raise HTTPException(400, "PIN must be 4 digits")
    async for ref in users_col.find({"role": "referee"}):
        if check_pw(pin, ref["pin_hash"]):
            return TokenOut(access_token=make_token(ref["id"], "referee"), role="referee",
                            user_id=ref["id"], name=ref.get("name"))
    raise HTTPException(401, "Invalid PIN")


@api.get("/auth/me")
async def auth_me(user: dict = Depends(current_user)):
    return {"id": user["id"], "role": user["role"], "name": user.get("name"), "email": user.get("email")}


# ---------- Teams ----------
@api.get("/teams")
async def list_teams():
    teams = await teams_col.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    if not teams:
        return []
    team_ids = [t["id"] for t in teams]
    all_players = await players_col.find(
        {"team_id": {"$in": team_ids}}, {"_id": 0}
    ).sort([("category", 1), ("is_captain", -1), ("name", 1)]).to_list(500)
    by_team: dict[str, list] = {}
    for p in all_players:
        by_team.setdefault(p["team_id"], []).append(p)
    for t in teams:
        t["players"] = by_team.get(t["id"], [])
    return teams


@api.post("/teams")
async def create_team(body: TeamIn, _: dict = Depends(require_role("admin", "referee"))):
    team = {"id": str(uuid.uuid4()), "name": body.name, "captain_name": body.captain_name or "",
            "created_at": datetime.now(timezone.utc).isoformat()}
    await teams_col.insert_one(team.copy())
    await hub.broadcast({"type": "teams_changed"})
    return team


@api.put("/teams/{team_id}")
async def update_team(team_id: str, body: TeamIn, _: dict = Depends(require_role("admin", "referee"))):
    res = await teams_col.update_one({"id": team_id},
        {"$set": {"name": body.name, "captain_name": body.captain_name or ""}})
    if res.matched_count == 0:
        raise HTTPException(404, "Team not found")
    await hub.broadcast({"type": "teams_changed"})
    return await teams_col.find_one({"id": team_id}, {"_id": 0})


@api.delete("/teams/{team_id}")
async def delete_team(team_id: str, _: dict = Depends(require_role("admin", "referee"))):
    await teams_col.delete_one({"id": team_id})
    await players_col.delete_many({"team_id": team_id})
    await hub.broadcast({"type": "teams_changed"})
    return {"ok": True}


@api.get("/teams/{team_id}/matches")
async def team_matches(team_id: str):
    """Return every match involving this team, enriched with fixture context.

    Sorted newest activity first: completed/live before scheduled, within group by fixture creation.
    """
    team = await teams_col.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Team not found")

    matches = await matches_col.find(
        {"$or": [{"team_a_id": team_id}, {"team_b_id": team_id}]},
        {"_id": 0},
    ).sort([("created_at", 1), ("round_number", 1), ("match_number", 1)]).to_list(2000)

    if not matches:
        return []

    fixture_ids = list({m["fixture_id"] for m in matches})
    fixtures = await fixtures_col.find(
        {"id": {"$in": fixture_ids}}, {"_id": 0}
    ).to_list(len(fixture_ids))
    fx_by_id = {f["id"]: f for f in fixtures}

    other_team_ids = {
        (m["team_b_id"] if m["team_a_id"] == team_id else m["team_a_id"]) for m in matches
    }
    others = await teams_col.find(
        {"id": {"$in": list(other_team_ids)}}, {"_id": 0}
    ).to_list(len(other_team_ids))
    name_by_id = {t["id"]: t["name"] for t in others}
    name_by_id[team_id] = team["name"]

    enriched = []
    for m in matches:
        f = fx_by_id.get(m["fixture_id"], {})
        is_a = m["team_a_id"] == team_id
        opp_id = m["team_b_id"] if is_a else m["team_a_id"]
        team_score = m.get("score_a", 0) if is_a else m.get("score_b", 0)
        opp_score = m.get("score_b", 0) if is_a else m.get("score_a", 0)
        outcome = "pending"
        if m.get("status") == "completed":
            if team_score > opp_score:
                outcome = "win"
            elif team_score < opp_score:
                outcome = "loss"
            else:
                outcome = "draw"
        enriched.append({
            "match_id": m["id"],
            "fixture_id": m["fixture_id"],
            "round_number": m.get("round_number"),
            "match_number": m.get("match_number"),
            "status": m.get("status", "scheduled"),
            "team_name": team["name"],
            "opponent_name": name_by_id.get(opp_id, "?"),
            "team_score": team_score,
            "opponent_score": opp_score,
            "outcome": outcome,
            "court_number": f.get("court_number"),
            "week_number": f.get("week_number"),
            "fixture_status": f.get("status", "scheduled"),
        })

    priority = {"live": 0, "completed": 1, "paused": 2, "scheduled": 3}
    enriched.sort(key=lambda x: (priority.get(x["status"], 9), -(x["round_number"] or 0), -(x["match_number"] or 0)))
    return enriched


@api.get("/teams/{team_id}")
async def get_team_detail(team_id: str):
    t = await teams_col.find_one({"id": team_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Team not found")
    players = await players_col.find({"team_id": team_id}, {"_id": 0}).sort(
        [("category", 1), ("is_captain", -1), ("name", 1)]
    ).to_list(50)
    t["players"] = players
    return t


# ---------- Players ----------
@api.get("/players")
async def list_players(team_id: Optional[str] = None):
    q: dict[str, Any] = {}
    if team_id:
        q["team_id"] = team_id
    return await players_col.find(q, {"_id": 0}).sort("name", 1).to_list(500)


@api.post("/players")
async def create_player(body: PlayerIn, _: dict = Depends(require_role("admin", "referee"))):
    await get_team(body.team_id)
    p = {"id": str(uuid.uuid4()), "name": body.name, "contact": body.contact or "",
         "age": body.age, "category": body.category or "beginner",
         "team_id": body.team_id, "is_captain": False,
         "created_at": datetime.now(timezone.utc).isoformat()}
    await players_col.insert_one(p.copy())
    await hub.broadcast({"type": "teams_changed"})
    return p


@api.put("/players/{player_id}")
async def update_player(player_id: str, body: PlayerIn, _: dict = Depends(require_role("admin", "referee"))):
    res = await players_col.update_one({"id": player_id},
        {"$set": {"name": body.name, "contact": body.contact or "", "age": body.age,
                  "category": body.category or "beginner", "team_id": body.team_id}})
    if res.matched_count == 0:
        raise HTTPException(404, "Player not found")
    await hub.broadcast({"type": "teams_changed"})
    return await players_col.find_one({"id": player_id}, {"_id": 0})


@api.delete("/players/{player_id}")
async def delete_player(player_id: str, _: dict = Depends(require_role("admin", "referee"))):
    await players_col.delete_one({"id": player_id})
    await hub.broadcast({"type": "teams_changed"})
    return {"ok": True}


# ---------- Fixtures ----------
@api.get("/fixtures")
async def list_fixtures():
    fs = await fixtures_col.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [await fixture_summary(f) for f in fs]


@api.get("/fixtures/{fixture_id}")
async def get_fixture(fixture_id: str):
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Fixture not found")
    return await fixture_summary(f, include_matches=True)


@api.post("/fixtures")
async def create_fixture(body: FixtureCreate, _: dict = Depends(require_role("admin", "referee"))):
    if body.team_a_id == body.team_b_id:
        raise HTTPException(400, "Teams must differ")
    await get_team(body.team_a_id)
    await get_team(body.team_b_id)
    now = datetime.now(timezone.utc).isoformat()
    fid = str(uuid.uuid4())
    current_week = await compute_current_week()
    fixture = {
        "id": fid, "team_a_id": body.team_a_id, "team_b_id": body.team_b_id,
        "court_number": body.court_number, "scheduled_at": body.scheduled_at,
        "target_score": body.target_score, "created_at": now,
        "week_number": current_week,
        "status": "scheduled",
        "started_at": None, "completed_at": None,
        "rounds": [
            {"round_number": r, "status": "scheduled", "started_at": None, "completed_at": None}
            for r in range(1, ROUNDS_PER_FIXTURE + 1)
        ],
    }
    await fixtures_col.insert_one(fixture.copy())
    for r in range(1, ROUNDS_PER_FIXTURE + 1):
        for mn in range(1, MATCHES_PER_ROUND + 1):
            await matches_col.insert_one({
                "id": str(uuid.uuid4()),
                "fixture_id": fid,
                "round_number": r, "match_number": mn,
                "team_a_id": body.team_a_id, "team_b_id": body.team_b_id,
                "team_a_player_ids": [], "team_b_player_ids": [],
                "target_score": body.target_score,
                "score_a": 0, "score_b": 0,
                "status": "scheduled", "history": [],
                "started_at": None, "finished_at": None, "winner_team_id": None,
                "created_at": now,
            })
    await hub.broadcast({"type": "fixture_changed", "fixture_id": fid})
    return await fixture_summary(fixture, include_matches=True)


@api.put("/fixtures/{fixture_id}")
async def update_fixture(fixture_id: str, body: FixtureUpdate, _: dict = Depends(require_role("admin", "referee"))):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    res = await fixtures_col.update_one({"id": fixture_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Fixture not found")
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": fixture_id})
    return await fixture_summary(f, include_matches=True)


@api.delete("/fixtures/{fixture_id}")
async def delete_fixture(fixture_id: str, _: dict = Depends(require_role("admin", "referee"))):
    await fixtures_col.delete_one({"id": fixture_id})
    await matches_col.delete_many({"fixture_id": fixture_id})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": fixture_id})
    return {"ok": True}


@api.post("/fixtures/{fixture_id}/start")
async def start_fixture(fixture_id: str, _: dict = Depends(require_role("admin", "referee"))):
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Fixture not found")
    if f.get("status") == "completed":
        raise HTTPException(400, "Fixture already completed")
    now = datetime.now(timezone.utc).isoformat()
    await fixtures_col.update_one(
        {"id": fixture_id},
        {"$set": {"status": "live", "started_at": f.get("started_at") or now}},
    )
    await hub.broadcast({"type": "fixture_changed", "fixture_id": fixture_id})
    return await fixture_summary(await fixtures_col.find_one({"id": fixture_id}, {"_id": 0}), include_matches=True)


@api.post("/fixtures/{fixture_id}/complete")
async def complete_fixture(fixture_id: str, _: dict = Depends(require_role("admin", "referee"))):
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Fixture not found")
    incomplete = await matches_col.count_documents({"fixture_id": fixture_id, "status": {"$ne": "completed"}})
    if incomplete > 0:
        raise HTTPException(400, f"{incomplete} match(es) still pending. Finish all 12 matches before completing the fixture.")
    await fixtures_col.update_one(
        {"id": fixture_id},
        {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}},
    )
    await hub.broadcast({"type": "fixture_changed", "fixture_id": fixture_id})
    return await fixture_summary(await fixtures_col.find_one({"id": fixture_id}, {"_id": 0}), include_matches=True)


@api.post("/fixtures/{fixture_id}/rounds/{round_number}/start")
async def start_round(fixture_id: str, round_number: int, _: dict = Depends(require_role("admin", "referee"))):
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Fixture not found")
    if f.get("status") != "live":
        raise HTTPException(400, "Fixture must be started before a round can begin")
    rounds = f.get("rounds", [])
    target = next((r for r in rounds if r["round_number"] == round_number), None)
    if not target:
        raise HTTPException(404, "Round not found")
    if target["status"] == "completed":
        raise HTTPException(400, "Round already completed")
    for r in rounds:
        if r["round_number"] < round_number and r["status"] != "completed":
            raise HTTPException(400, f"Complete Round {r['round_number']} before starting Round {round_number}")
    target["status"] = "live"
    target["started_at"] = target.get("started_at") or datetime.now(timezone.utc).isoformat()
    await fixtures_col.update_one({"id": fixture_id}, {"$set": {"rounds": rounds}})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": fixture_id})
    return await fixture_summary(await fixtures_col.find_one({"id": fixture_id}, {"_id": 0}), include_matches=True)


@api.post("/fixtures/{fixture_id}/rounds/{round_number}/complete")
async def complete_round(fixture_id: str, round_number: int, _: dict = Depends(require_role("admin", "referee"))):
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Fixture not found")
    pending = await matches_col.count_documents({
        "fixture_id": fixture_id, "round_number": round_number,
        "status": {"$ne": "completed"},
    })
    if pending > 0:
        raise HTTPException(400, f"{pending} match(es) in Round {round_number} still pending")
    rounds = f.get("rounds", [])
    target = next((r for r in rounds if r["round_number"] == round_number), None)
    if not target:
        raise HTTPException(404, "Round not found")
    target["status"] = "completed"
    target["completed_at"] = datetime.now(timezone.utc).isoformat()
    await fixtures_col.update_one({"id": fixture_id}, {"$set": {"rounds": rounds}})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": fixture_id})
    return await fixture_summary(await fixtures_col.find_one({"id": fixture_id}, {"_id": 0}), include_matches=True)


# ---------- Matches ----------
@api.get("/matches/{match_id}")
async def get_match(match_id: str):
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    f = await fixtures_col.find_one({"id": m["fixture_id"]}, {"_id": 0})
    res = await hydrate_match(m)
    if f:
        a = await teams_col.find_one({"id": f["team_a_id"]}, {"_id": 0})
        b = await teams_col.find_one({"id": f["team_b_id"]}, {"_id": 0})
        res["team_a_name"] = a["name"] if a else "?"
        res["team_b_name"] = b["name"] if b else "?"
        res["court_number"] = f.get("court_number", 1)
    return res


@api.put("/matches/{match_id}")
async def update_match(match_id: str, body: MatchUpdate, _: dict = Depends(require_role("admin", "referee"))):
    update: dict[str, Any] = {}
    for k, v in body.dict().items():
        if v is None:
            continue
        if k in ("team_a_player_ids", "team_b_player_ids"):
            update[k] = v[:2]
        else:
            update[k] = v
    if not update:
        raise HTTPException(400, "No fields to update")
    res = await matches_col.update_one({"id": match_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Match not found")
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": m["fixture_id"], "match_id": match_id})
    return await get_match(match_id)


@api.post("/matches/{match_id}/start")
async def start_match(match_id: str, _: dict = Depends(require_role("admin", "referee"))):
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    if m["status"] == "completed":
        raise HTTPException(400, "Match already completed")
    f = await fixtures_col.find_one({"id": m["fixture_id"]}, {"_id": 0})
    if not f or f.get("status") != "live":
        raise HTTPException(400, "Start the fixture before starting matches")
    rd = next((r for r in f.get("rounds", []) if r["round_number"] == m["round_number"]), None)
    if not rd or rd.get("status") != "live":
        raise HTTPException(400, f"Round {m['round_number']} must be started first")
    other_live = await matches_col.count_documents({
        "fixture_id": m["fixture_id"],
        "status": "live",
        "id": {"$ne": match_id},
    })
    if other_live > 0:
        raise HTTPException(400, "Another match in this fixture is already live. Pause or finish it first.")
    if (len(m.get("team_a_player_ids", [])) != 2 or len(m.get("team_b_player_ids", [])) != 2):
        raise HTTPException(400, "Assign 2 players to each team before starting the match")
    await matches_col.update_one(
        {"id": match_id},
        {"$set": {"status": "live", "started_at": m.get("started_at") or datetime.now(timezone.utc).isoformat()}},
    )
    await hub.broadcast({"type": "fixture_changed", "fixture_id": m["fixture_id"], "match_id": match_id})
    return await get_match(match_id)


@api.post("/matches/{match_id}/pause")
async def pause_match(match_id: str, _: dict = Depends(require_role("admin", "referee"))):
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    if m["status"] != "live":
        raise HTTPException(400, "Only live matches can be paused")
    await matches_col.update_one({"id": match_id}, {"$set": {"status": "paused"}})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": m["fixture_id"], "match_id": match_id})
    return await get_match(match_id)


@api.post("/matches/{match_id}/resume")
async def resume_match(match_id: str, _: dict = Depends(require_role("admin", "referee"))):
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    if m["status"] != "paused":
        raise HTTPException(400, "Only paused matches can be resumed")
    other_live = await matches_col.count_documents({
        "fixture_id": m["fixture_id"], "status": "live", "id": {"$ne": match_id},
    })
    if other_live > 0:
        raise HTTPException(400, "Another match in this fixture is already live.")
    await matches_col.update_one({"id": match_id}, {"$set": {"status": "live"}})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": m["fixture_id"], "match_id": match_id})
    return await get_match(match_id)


@api.post("/matches/{match_id}/score")
async def score_point(match_id: str, side: str, _: dict = Depends(require_role("admin", "referee"))):
    if side not in ("a", "b"):
        raise HTTPException(400, "side must be 'a' or 'b'")
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    if m["status"] != "live":
        raise HTTPException(400, "Match must be live to score. Start it first.")
    field = "score_a" if side == "a" else "score_b"
    new_score = (m.get(field) or 0) + 1
    history = m.get("history", [])
    history.append(side)
    update: dict[str, Any] = {field: new_score, "history": history}
    target = int(m.get("target_score") or 0)
    match_completed = target > 0 and new_score >= target
    if match_completed:
        update["status"] = "completed"
        update["winner_team_id"] = m["team_a_id"] if side == "a" else m["team_b_id"]
        update["finished_at"] = datetime.now(timezone.utc).isoformat()
    await matches_col.update_one({"id": match_id}, {"$set": update})

    if match_completed:
        await _maybe_auto_complete_round(m["fixture_id"], m["round_number"])
        await _maybe_auto_complete_fixture(m["fixture_id"])

    await hub.broadcast({"type": "fixture_changed", "fixture_id": m["fixture_id"], "match_id": match_id})
    return await get_match(match_id)


async def _maybe_auto_complete_round(fixture_id: str, round_number: int) -> None:
    pending = await matches_col.count_documents(
        {"fixture_id": fixture_id, "round_number": round_number, "status": {"$ne": "completed"}}
    )
    if pending > 0:
        return
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    if not f:
        return
    rounds = f.get("rounds", [])
    target = next((r for r in rounds if r["round_number"] == round_number), None)
    if target and target.get("status") != "completed":
        target["status"] = "completed"
        target["completed_at"] = datetime.now(timezone.utc).isoformat()
        await fixtures_col.update_one({"id": fixture_id}, {"$set": {"rounds": rounds}})


async def _maybe_auto_complete_fixture(fixture_id: str) -> None:
    pending = await matches_col.count_documents(
        {"fixture_id": fixture_id, "status": {"$ne": "completed"}}
    )
    if pending > 0:
        return
    f = await fixtures_col.find_one({"id": fixture_id}, {"_id": 0})
    if not f or f.get("status") == "completed":
        return
    await fixtures_col.update_one(
        {"id": fixture_id},
        {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}},
    )


@api.post("/matches/{match_id}/undo")
async def undo_point(match_id: str, _: dict = Depends(require_role("admin", "referee"))):
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    history = m.get("history", [])
    if not history:
        raise HTTPException(400, "Nothing to undo")
    last = history.pop()
    field = "score_a" if last == "a" else "score_b"
    new_score = max(0, (m.get(field) or 0) - 1)
    await matches_col.update_one({"id": match_id}, {"$set": {field: new_score, "history": history}})
    await hub.broadcast({"type": "fixture_changed", "fixture_id": m["fixture_id"], "match_id": match_id})
    return await get_match(match_id)


@api.post("/matches/{match_id}/finish")
async def finish_match(match_id: str, _: dict = Depends(require_role("admin", "referee"))):
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    winner = None
    if m["score_a"] > m["score_b"]:
        winner = m["team_a_id"]
    elif m["score_b"] > m["score_a"]:
        winner = m["team_b_id"]
    await matches_col.update_one(
        {"id": match_id},
        {"$set": {"status": "completed", "winner_team_id": winner,
                  "finished_at": datetime.now(timezone.utc).isoformat()}},
    )
    await _maybe_auto_complete_round(m["fixture_id"], m["round_number"])
    await _maybe_auto_complete_fixture(m["fixture_id"])
    await hub.broadcast({"type": "fixture_changed", "fixture_id": m["fixture_id"], "match_id": match_id})
    return await get_match(match_id)


# ---------- Leaderboard ----------
@api.get("/leaderboard")
async def leaderboard():
    teams = await teams_col.find({}, {"_id": 0}).to_list(100)
    stats: dict[str, dict[str, Any]] = {}
    for t in teams:
        stats[t["id"]] = {
            "team_id": t["id"],
            "team_name": t["name"],
            "fixtures_played": 0,
            "fixture_wins": 0,
            "fixture_losses": 0,
            "matches_played": 0,
            "match_wins": 0,
            "points_for": 0,
            "points_against": 0,
            "points_diff": 0,
            "bonus_points": int(t.get("bonus_points") or 0),
            "tournament_points": int(t.get("bonus_points") or 0),
        }
    async for m in matches_col.find(
        {},
        {"_id": 0, "score_a": 1, "score_b": 1, "status": 1, "team_a_id": 1, "team_b_id": 1},
    ).limit(5000):
        sa, sb = m.get("score_a", 0), m.get("score_b", 0)
        if sa == 0 and sb == 0 and m.get("status") != "completed":
            continue
        a, b = m["team_a_id"], m["team_b_id"]
        if a in stats:
            stats[a]["points_for"] += sa
            stats[a]["points_against"] += sb
            stats[a]["tournament_points"] += sa
            if m.get("status") == "completed":
                stats[a]["matches_played"] += 1
                if sa > sb:
                    stats[a]["match_wins"] += 1
        if b in stats:
            stats[b]["points_for"] += sb
            stats[b]["points_against"] += sa
            stats[b]["tournament_points"] += sb
            if m.get("status") == "completed":
                stats[b]["matches_played"] += 1
                if sb > sa:
                    stats[b]["match_wins"] += 1

    async for f in fixtures_col.find({"status": "completed"}, {"_id": 0}).limit(500):
        f_full = await fixture_summary(f)
        if f_full["status"] != "completed":
            continue
        a, b = f_full["team_a_id"], f_full["team_b_id"]
        if a in stats: stats[a]["fixtures_played"] += 1
        if b in stats: stats[b]["fixtures_played"] += 1
        if f_full["total_a"] > f_full["total_b"]:
            if a in stats: stats[a]["fixture_wins"] += 1
            if b in stats: stats[b]["fixture_losses"] += 1
        elif f_full["total_b"] > f_full["total_a"]:
            if b in stats: stats[b]["fixture_wins"] += 1
            if a in stats: stats[a]["fixture_losses"] += 1

    rows = list(stats.values())
    for r in rows:
        r["points_diff"] = r["points_for"] - r["points_against"]
    rows.sort(key=lambda r: (-r["tournament_points"], -r["points_diff"], -r["fixture_wins"], r["team_name"]))
    for idx, r in enumerate(rows):
        r["rank"] = idx + 1
    return rows


# ---------- Referees admin ----------
@api.get("/referees")
async def list_referees(_: dict = Depends(require_role("admin", "referee"))):
    return await users_col.find({"role": "referee"}, {"_id": 0, "pin_hash": 0}).to_list(50)


@api.post("/referees")
async def create_referee(body: RefereeCreate, _: dict = Depends(require_role("admin", "referee"))):
    pin = body.pin.strip()
    if len(pin) != 4 or not pin.isdigit():
        raise HTTPException(400, "PIN must be 4 digits")
    ref = {"id": str(uuid.uuid4()), "role": "referee", "name": body.name,
           "pin_hash": hash_pw(pin), "created_at": datetime.now(timezone.utc).isoformat()}
    await users_col.insert_one(ref.copy())
    ref.pop("pin_hash", None)
    return ref


@api.delete("/referees/{ref_id}")
async def delete_referee(ref_id: str, _: dict = Depends(require_role("admin", "referee"))):
    await users_col.delete_one({"id": ref_id, "role": "referee"})
    return {"ok": True}


# ---------- WS ----------
@app.websocket("/api/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        await ws.send_json({"type": "hello"})
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await hub.disconnect(ws)
    except Exception as exc:
        log.warning("WS error: %s", exc)
        await hub.disconnect(ws)


app.include_router(api)


@app.on_event("shutdown")
async def shutdown():
    client.close()
