"""PickleScore - Pickleball Tournament Live Scoring backend.

FastAPI + MongoDB (motor) + JWT auth + WebSocket real-time updates.
All routes prefixed with /api.
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
    status,
)
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

# ---------- Config ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "picklescore")

JWT_SECRET = os.environ.get("JWT_SECRET", "picklescore-dev-secret-change-me-please-very-long")
JWT_ALG = "HS256"
TOKEN_TTL_MIN = 60 * 24 * 7  # 1 week

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "shanaygala@gmail.com")
ADMIN_DEFAULT_PASSWORD = os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")
REFEREE_DEFAULT_PIN = os.environ.get("REFEREE_DEFAULT_PIN", "1234")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
log = logging.getLogger("picklescore")

# ---------- DB ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
users_col = db.users
teams_col = db.teams
players_col = db.players
matches_col = db.matches


# ---------- Hashing ----------
def hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_pw(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------- Models (request/response) ----------
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


class PlayerIn(BaseModel):
    name: str
    contact: Optional[str] = ""
    age: Optional[int] = None
    category: Optional[str] = "beginner"
    team_id: str


class PlayerOut(BaseModel):
    id: str
    name: str
    contact: str = ""
    age: Optional[int] = None
    category: str = "beginner"
    team_id: str
    is_captain: bool = False


class TeamIn(BaseModel):
    name: str
    captain_name: Optional[str] = ""


class TeamOut(BaseModel):
    id: str
    name: str
    captain_name: str = ""
    created_at: str


class MatchCreate(BaseModel):
    team_a_id: str
    team_b_id: str
    court_number: int = 1
    scheduled_at: Optional[str] = None  # ISO string
    team_a_player_ids: list[str] = Field(default_factory=list)
    team_b_player_ids: list[str] = Field(default_factory=list)
    target_score: int = 11


class MatchUpdate(BaseModel):
    court_number: Optional[int] = None
    scheduled_at: Optional[str] = None
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


# ---------- WebSocket manager ----------
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


# ---------- Seeding ----------
SEED_TEAMS = [
    {"name": "TEAM SAMEER", "captain": "sameer deepak chheda", "players": [
        ("dheer gada", "7045111081", 20, "beginner"),
        ("krishit karia", "9137228449", 18, "advance"),
        ("devansh sanjay savla", "9324288556", 23, "beginner"),
        ("mayur shantilal faria", "9372160047", 34, "beginner"),
        ("sameer deepak chheda", "9820447768", 30, "advance"),
        ("deep dhiraj shah", "8080577776", 28, "beginner"),
    ]},
    {"name": "TEAM KIRAN", "captain": "kiran maganlal chheda", "players": [
        ("jay haresh gala", "9870799606", 32, "beginner"),
        ("kiran maganlal chheda", "9930053937", 43, "advance"),
        ("devarya mukesh shah", "7718011112", 25, "beginner"),
        ("krushik gala", "8767066990", 32, "beginner"),
        ("kevin jayesh shah", "9833302200", 26, "advance"),
        ("zeal haresh karia", "9821549345", 27, "beginner"),
    ]},
    {"name": "TEAM HETANKSH", "captain": "hetanksh chheda", "players": [
        ("jainam narendra gada", "9867242409", 26, "beginner"),
        ("smit shailesh gada", "9082279530", 24, "advance"),
        ("romil r chheda", "9930543054", 29, "beginner"),
        ("ravi mansukh shah", "9769349320", 33, "beginner"),
        ("hetanksh chheda", "9819652420", 27, "advance"),
        ("Harshil Gindra", "8356058687", 23, "beginner"),
    ]},
    {"name": "TEAM URVIL", "captain": "urvil khutiya", "players": [
        ("bhavin satra", "9321155159", 37, "beginner"),
        ("manan navin shah", "9833030320", 29, "advance"),
        ("hridhaan karia", "8591446982", 15, "beginner"),
        ("daksh nilesh savla", "9819673550", 20, "beginner"),
        ("urvil khutiya", "8082027775", 31, "advance"),
        ("Nayan Rita", "7045422390", 22, "beginner"),
    ]},
    {"name": "TEAM SIDDHARTH", "captain": "siddharth gada", "players": [
        ("pranay jayantilal nisar", "9820314606", 30, "beginner"),
        ("hiten pravin khirani", "9819117722", 48, "advance"),
        ("yug manoj chheda", "9967875565", 24, "beginner"),
        ("mitesh karia", "9819272009", 41, "beginner"),
        ("siddharth gada", "9619154785", 29, "advance"),
        ("bhavin gala", "9892910997", 36, "beginner"),
    ]},
    {"name": "TEAM PRATIK", "captain": "pratik gala", "players": [
        ("smit chaadwa", "8356808959", 22, "beginner"),
        ("mohik hiten khirani", "9768633786", 21, "advance"),
        ("vatsal shah", "9820242428", 25, "beginner"),
        ("pratik m shah", "9833252526", 33, "beginner"),
        ("pratik gala", "9967243500", 29, "advance"),
        ("deepan dagha", "9821271190", 27, "beginner"),
    ]},
    {"name": "TEAM HEET", "captain": "heet navin chheda", "players": [
        ("shanay gala", "9821242079", 23, "beginner"),
        ("deven urmarshi rita", "9821733976", 44, "beginner"),
        ("heet navin chheda", "9820113263", 28, "advance"),
        ("ayush gada", "9930063677", 27, "beginner"),
        ("Vansh Vinod Chheda", "7738227171", 21, "advance"),
        ("Yugam Dedhia", "8169401782", 21, "beginner"),
    ]},
    {"name": "TEAM HEMIL", "captain": "hemil shah", "players": [
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

    # Seed admin
    admin = await users_col.find_one({"email": ADMIN_EMAIL, "role": "admin"})
    if not admin:
        await users_col.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "password_hash": hash_pw(ADMIN_DEFAULT_PASSWORD),
            "role": "admin",
            "name": "Tournament Admin",
            "created_at": now,
        })
        log.info("Seeded admin %s", ADMIN_EMAIL)

    # Seed a default referee (PIN=1234)
    ref = await users_col.find_one({"role": "referee", "name": "Referee 1"})
    if not ref:
        await users_col.insert_one({
            "id": str(uuid.uuid4()),
            "role": "referee",
            "name": "Referee 1",
            "pin_hash": hash_pw(REFEREE_DEFAULT_PIN),
            "created_at": now,
        })
        log.info("Seeded referee PIN=%s", REFEREE_DEFAULT_PIN)

    # Seed teams + players
    if await teams_col.count_documents({}) == 0:
        for t in SEED_TEAMS:
            team_id = str(uuid.uuid4())
            await teams_col.insert_one({
                "id": team_id,
                "name": t["name"],
                "captain_name": t["captain"],
                "created_at": now,
            })
            for (pname, contact, age, cat) in t["players"]:
                await players_col.insert_one({
                    "id": str(uuid.uuid4()),
                    "name": pname,
                    "contact": contact,
                    "age": age,
                    "category": cat,
                    "team_id": team_id,
                    "is_captain": pname.strip().lower() == t["captain"].strip().lower(),
                    "created_at": now,
                })
        log.info("Seeded %d teams", len(SEED_TEAMS))


# ---------- Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_initial()
    yield
    client.close()


app = FastAPI(title="PickleScore", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api = APIRouter(prefix="/api")


# ---------- Helpers ----------
def strip_id(doc: dict) -> dict:
    if doc:
        doc.pop("_id", None)
    return doc


async def get_team(team_id: str) -> dict:
    t = await teams_col.find_one({"id": team_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, f"Team {team_id} not found")
    return t


async def serialize_match(m: dict) -> dict:
    """Attach team + player details for client consumption."""
    if not m:
        return m
    m = {k: v for k, v in m.items() if k != "_id"}
    a = await teams_col.find_one({"id": m["team_a_id"]}, {"_id": 0})
    b = await teams_col.find_one({"id": m["team_b_id"]}, {"_id": 0})
    m["team_a_name"] = a["name"] if a else "?"
    m["team_b_name"] = b["name"] if b else "?"
    pa = await players_col.find(
        {"id": {"$in": m.get("team_a_player_ids", [])}}, {"_id": 0}
    ).to_list(10)
    pb = await players_col.find(
        {"id": {"$in": m.get("team_b_player_ids", [])}}, {"_id": 0}
    ).to_list(10)
    m["team_a_players"] = pa
    m["team_b_players"] = pb
    return m


# ---------- Routes: health ----------
@api.get("/")
async def root():
    return {"app": "PickleScore", "status": "ok"}


@api.get("/health")
async def health():
    return {"ok": True, "ts": datetime.now(timezone.utc).isoformat()}


# ---------- Routes: auth ----------
@api.post("/auth/admin/login", response_model=TokenOut)
async def admin_login(body: AdminLogin):
    user = await users_col.find_one({"email": body.email.lower(), "role": "admin"})
    if not user or not check_pw(body.password, user["password_hash"]):
        # Try case-sensitive email match too
        user = await users_col.find_one({"email": body.email, "role": "admin"})
    if not user or not check_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid admin credentials")
    return TokenOut(
        access_token=make_token(user["id"], "admin"),
        role="admin",
        user_id=user["id"],
        name=user.get("name"),
    )


@api.post("/auth/referee/login", response_model=TokenOut)
async def referee_login(body: RefereeLogin):
    pin = body.pin.strip()
    if len(pin) != 4 or not pin.isdigit():
        raise HTTPException(400, "PIN must be 4 digits")
    async for ref in users_col.find({"role": "referee"}):
        if check_pw(pin, ref["pin_hash"]):
            return TokenOut(
                access_token=make_token(ref["id"], "referee"),
                role="referee",
                user_id=ref["id"],
                name=ref.get("name"),
            )
    raise HTTPException(401, "Invalid PIN")


@api.get("/auth/me")
async def auth_me(user: dict = Depends(current_user)):
    return {
        "id": user["id"],
        "role": user["role"],
        "name": user.get("name"),
        "email": user.get("email"),
    }


# ---------- Routes: teams ----------
@api.get("/teams")
async def list_teams():
    teams = await teams_col.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    # attach players
    for t in teams:
        t["players"] = await players_col.find(
            {"team_id": t["id"]}, {"_id": 0}
        ).sort("is_captain", -1).to_list(50)
    return teams


@api.post("/teams")
async def create_team(body: TeamIn, _: dict = Depends(require_role("admin"))):
    team = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "captain_name": body.captain_name or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await teams_col.insert_one(team.copy())
    await hub.broadcast({"type": "teams_changed"})
    return team


@api.put("/teams/{team_id}")
async def update_team(team_id: str, body: TeamIn, _: dict = Depends(require_role("admin"))):
    res = await teams_col.update_one(
        {"id": team_id},
        {"$set": {"name": body.name, "captain_name": body.captain_name or ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Team not found")
    await hub.broadcast({"type": "teams_changed"})
    return await teams_col.find_one({"id": team_id}, {"_id": 0})


@api.delete("/teams/{team_id}")
async def delete_team(team_id: str, _: dict = Depends(require_role("admin"))):
    await teams_col.delete_one({"id": team_id})
    await players_col.delete_many({"team_id": team_id})
    await hub.broadcast({"type": "teams_changed"})
    return {"ok": True}


# ---------- Routes: players ----------
@api.get("/players")
async def list_players(team_id: Optional[str] = None):
    q: dict[str, Any] = {}
    if team_id:
        q["team_id"] = team_id
    players = await players_col.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    return players


@api.post("/players")
async def create_player(body: PlayerIn, _: dict = Depends(require_role("admin"))):
    await get_team(body.team_id)
    player = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "contact": body.contact or "",
        "age": body.age,
        "category": body.category or "beginner",
        "team_id": body.team_id,
        "is_captain": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await players_col.insert_one(player.copy())
    await hub.broadcast({"type": "teams_changed"})
    return player


@api.put("/players/{player_id}")
async def update_player(player_id: str, body: PlayerIn, _: dict = Depends(require_role("admin"))):
    res = await players_col.update_one(
        {"id": player_id},
        {"$set": {
            "name": body.name,
            "contact": body.contact or "",
            "age": body.age,
            "category": body.category or "beginner",
            "team_id": body.team_id,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Player not found")
    await hub.broadcast({"type": "teams_changed"})
    return await players_col.find_one({"id": player_id}, {"_id": 0})


@api.delete("/players/{player_id}")
async def delete_player(player_id: str, _: dict = Depends(require_role("admin"))):
    await players_col.delete_one({"id": player_id})
    await hub.broadcast({"type": "teams_changed"})
    return {"ok": True}


# ---------- Routes: matches ----------
@api.get("/matches")
async def list_matches(status_filter: Optional[str] = None):
    q: dict[str, Any] = {}
    if status_filter:
        q["status"] = status_filter
    cursor = matches_col.find(q, {"_id": 0}).sort([("status", 1), ("scheduled_at", 1), ("created_at", 1)])
    matches = await cursor.to_list(500)
    return [await serialize_match(m) for m in matches]


@api.get("/matches/{match_id}")
async def get_match(match_id: str):
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    return await serialize_match(m)


@api.post("/matches")
async def create_match(body: MatchCreate, _: dict = Depends(require_role("admin"))):
    await get_team(body.team_a_id)
    await get_team(body.team_b_id)
    if body.team_a_id == body.team_b_id:
        raise HTTPException(400, "Teams must be different")
    match = {
        "id": str(uuid.uuid4()),
        "team_a_id": body.team_a_id,
        "team_b_id": body.team_b_id,
        "court_number": body.court_number,
        "scheduled_at": body.scheduled_at,
        "team_a_player_ids": body.team_a_player_ids[:2],
        "team_b_player_ids": body.team_b_player_ids[:2],
        "target_score": body.target_score,
        "score_a": 0,
        "score_b": 0,
        "status": "upcoming",  # upcoming | live | completed
        "history": [],  # list of "a" or "b" points
        "winner_team_id": None,
        "started_at": None,
        "finished_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await matches_col.insert_one(match.copy())
    await hub.broadcast({"type": "match_changed", "match_id": match["id"]})
    return await serialize_match(match)


@api.put("/matches/{match_id}")
async def update_match(match_id: str, body: MatchUpdate, _: dict = Depends(require_role("admin"))):
    update: dict[str, Any] = {}
    for f in ("court_number", "scheduled_at", "team_a_player_ids", "team_b_player_ids",
              "target_score", "score_a", "score_b", "status"):
        v = getattr(body, f)
        if v is not None:
            if f in ("team_a_player_ids", "team_b_player_ids"):
                update[f] = v[:2]
            else:
                update[f] = v
    if not update:
        raise HTTPException(400, "No fields to update")
    res = await matches_col.update_one({"id": match_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Match not found")
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    await hub.broadcast({"type": "match_changed", "match_id": match_id})
    return await serialize_match(m)


@api.delete("/matches/{match_id}")
async def delete_match(match_id: str, _: dict = Depends(require_role("admin"))):
    await matches_col.delete_one({"id": match_id})
    await hub.broadcast({"type": "match_changed", "match_id": match_id})
    return {"ok": True}


@api.post("/matches/{match_id}/start")
async def start_match(match_id: str, _: dict = Depends(require_role("admin", "referee"))):
    now = datetime.now(timezone.utc).isoformat()
    res = await matches_col.update_one(
        {"id": match_id, "status": {"$ne": "completed"}},
        {"$set": {"status": "live", "started_at": now}},
    )
    if res.matched_count == 0:
        raise HTTPException(400, "Cannot start match")
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    await hub.broadcast({"type": "match_changed", "match_id": match_id})
    return await serialize_match(m)


@api.post("/matches/{match_id}/score")
async def score_point(match_id: str, side: str, user: dict = Depends(require_role("admin", "referee"))):
    if side not in ("a", "b"):
        raise HTTPException(400, "side must be 'a' or 'b'")
    m = await matches_col.find_one({"id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Match not found")
    if m["status"] == "completed":
        raise HTTPException(400, "Match already completed")
    field = "score_a" if side == "a" else "score_b"
    new_score = (m.get(field) or 0) + 1
    history = m.get("history", [])
    history.append(side)
    update = {field: new_score, "history": history}
    if m["status"] != "live":
        update["status"] = "live"
        update["started_at"] = m.get("started_at") or datetime.now(timezone.utc).isoformat()
    await matches_col.update_one({"id": match_id}, {"$set": update})
    m2 = await matches_col.find_one({"id": match_id}, {"_id": 0})
    await hub.broadcast({"type": "match_changed", "match_id": match_id})
    return await serialize_match(m2)


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
    await matches_col.update_one(
        {"id": match_id},
        {"$set": {field: new_score, "history": history}},
    )
    m2 = await matches_col.find_one({"id": match_id}, {"_id": 0})
    await hub.broadcast({"type": "match_changed", "match_id": match_id})
    return await serialize_match(m2)


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
        {"$set": {
            "status": "completed",
            "winner_team_id": winner,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    m2 = await matches_col.find_one({"id": match_id}, {"_id": 0})
    await hub.broadcast({"type": "match_changed", "match_id": match_id})
    return await serialize_match(m2)


# ---------- Leaderboard ----------
@api.get("/leaderboard")
async def leaderboard():
    teams = await teams_col.find({}, {"_id": 0}).to_list(100)
    stats: dict[str, dict[str, Any]] = {}
    for t in teams:
        stats[t["id"]] = {
            "team_id": t["id"],
            "team_name": t["name"],
            "matches_played": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "points_for": 0,
            "points_against": 0,
            "points_diff": 0,
            "tournament_points": 0,
        }
    completed = await matches_col.find({"status": "completed"}, {"_id": 0}).to_list(500)
    for m in completed:
        a, b = m["team_a_id"], m["team_b_id"]
        sa, sb = m.get("score_a", 0), m.get("score_b", 0)
        if a in stats:
            stats[a]["matches_played"] += 1
            stats[a]["points_for"] += sa
            stats[a]["points_against"] += sb
        if b in stats:
            stats[b]["matches_played"] += 1
            stats[b]["points_for"] += sb
            stats[b]["points_against"] += sa
        if sa > sb:
            if a in stats: stats[a]["wins"] += 1
            if b in stats: stats[b]["losses"] += 1
        elif sb > sa:
            if b in stats: stats[b]["wins"] += 1
            if a in stats: stats[a]["losses"] += 1
        else:
            if a in stats: stats[a]["draws"] += 1
            if b in stats: stats[b]["draws"] += 1
    rows = list(stats.values())
    for r in rows:
        r["points_diff"] = r["points_for"] - r["points_against"]
        r["tournament_points"] = r["wins"] * 2 + r["draws"] * 1
    rows.sort(key=lambda r: (-r["tournament_points"], -r["wins"], -r["points_diff"], r["team_name"]))
    for idx, r in enumerate(rows):
        r["rank"] = idx + 1
    return rows


# ---------- Referees admin ----------
@api.get("/referees")
async def list_referees(_: dict = Depends(require_role("admin"))):
    refs = await users_col.find({"role": "referee"}, {"_id": 0, "pin_hash": 0}).to_list(50)
    return refs


@api.post("/referees")
async def create_referee(body: RefereeCreate, _: dict = Depends(require_role("admin"))):
    pin = body.pin.strip()
    if len(pin) != 4 or not pin.isdigit():
        raise HTTPException(400, "PIN must be 4 digits")
    ref = {
        "id": str(uuid.uuid4()),
        "role": "referee",
        "name": body.name,
        "pin_hash": hash_pw(pin),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await users_col.insert_one(ref.copy())
    ref.pop("pin_hash", None)
    return ref


@api.delete("/referees/{ref_id}")
async def delete_referee(ref_id: str, _: dict = Depends(require_role("admin"))):
    await users_col.delete_one({"id": ref_id, "role": "referee"})
    return {"ok": True}


# ---------- WebSocket ----------
@app.websocket("/api/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        await ws.send_json({"type": "hello"})
        while True:
            # Heartbeat: client should just keep the connection alive
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
