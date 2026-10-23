"""Olabs - Back office de demandas (FastAPI + MongoDB)."""
import os
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from typing import List, Optional, Dict, Any

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query, UploadFile, File, Request
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
APP_NAME = os.environ.get("APP_NAME", "olabs")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
MAX_FILE = 25 * 1024 * 1024

app = FastAPI(title="Olabs")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("olabs")

COLORS = ["coral", "sky", "amber", "teal", "lilac", "slate"]
KINDS = ["todo", "doing", "waiting", "done"]
PRIOS = ["alta", "media", "baixa"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def clean(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    out = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------- storage
storage_key: Optional[str] = None


def init_storage(force: bool = False) -> str:
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    for attempt in range(2):
        key = init_storage(force=attempt > 0)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
        if resp.status_code == 404 and attempt == 0:
            continue
        resp.raise_for_status()
        return resp.json()
    raise HTTPException(502, "Falha ao enviar arquivo")


def get_object(path: str):
    for attempt in range(2):
        key = init_storage(force=attempt > 0)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        if resp.status_code == 404 and attempt == 0:
            continue
        resp.raise_for_status()
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    raise HTTPException(404, "Arquivo não encontrado")


# ---------------------------------------------------------------- auth helpers
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(uid: str) -> str:
    return jwt.encode({"sub": uid, "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET, algorithm="HS256")


async def _user_from_token(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sessão expirada, entre novamente")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user:
        raise HTTPException(401, "Usuário não encontrado")
    last = user.get("last_seen")
    nowdt = datetime.now(timezone.utc)
    if not last or (nowdt - datetime.fromisoformat(last)).total_seconds() > 60:
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_seen": nowdt.isoformat()}})
        user["last_seen"] = nowdt.isoformat()
    return user


async def current_user(authorization: Optional[str] = Header(None)) -> dict:
    token = authorization.split(" ", 1)[1] if authorization and authorization.lower().startswith("bearer ") else None
    return await _user_from_token(token)


def initials_color(seed: str) -> str:
    return COLORS[sum(ord(c) for c in seed) % len(COLORS)]


def public_user(u: dict) -> dict:
    online = False
    if u.get("last_seen"):
        try:
            online = (datetime.now(timezone.utc) - datetime.fromisoformat(u["last_seen"])).total_seconds() < 300
        except Exception:
            online = False
    return {
        "id": u["id"], "name": u.get("name", ""), "short": u.get("short") or u.get("name", "").split(" ")[0],
        "email": u.get("email"), "role": u.get("role", ""), "phone": u.get("phone", ""), "about": u.get("about", ""),
        "color": u.get("color", "slate"), "avatar_v": u.get("avatar_v"), "online": online,
        "created_at": u.get("created_at"),
    }


DEFAULT_STAGES = [
    {"name": "Pedido", "color": "sky", "kind": "todo"},
    {"name": "Em andamento", "color": "lilac", "kind": "doing"},
    {"name": "Em aguardo", "color": "amber", "kind": "waiting"},
    {"name": "Entregue", "color": "teal", "kind": "done"},
]
DEFAULT_NOTIF = {"assigned": True, "comments": True, "mentions": True, "due_soon": True}


async def get_settings(uid: str) -> dict:
    s = await db.settings.find_one({"user_id": uid}, {"_id": 0})
    if not s:
        s = {"user_id": uid, "default_stages": DEFAULT_STAGES, "tags": [], "notif": DEFAULT_NOTIF}
        await db.settings.insert_one(dict(s))
    s.setdefault("notif", DEFAULT_NOTIF)
    for k, v in DEFAULT_NOTIF.items():
        s["notif"].setdefault(k, v)
    return s


async def contact_ids(uid: str) -> List[str]:
    rows = await db.contacts.find({"user_id": uid}, {"_id": 0}).to_list(2000)
    return [r["contact_id"] for r in rows]


async def connect(a: str, b: str):
    for x, y in ((a, b), (b, a)):
        await db.contacts.update_one({"user_id": x, "contact_id": y},
                                     {"$setOnInsert": {"user_id": x, "contact_id": y, "created_at": now_iso()}}, upsert=True)


# ---------------------------------------------------------------- models
class RegisterIn(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = ""


class LoginIn(BaseModel):
    email: str
    password: str


class PasswordIn(BaseModel):
    current: str
    new: str


class ProfileIn(BaseModel):
    name: Optional[str] = None
    short: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    about: Optional[str] = None
    email: Optional[str] = None
    color: Optional[str] = None


class AddPersonIn(BaseModel):
    email: str


class StageIn(BaseModel):
    id: Optional[str] = None
    name: str
    color: str = "sky"
    kind: str = "todo"


class ProjectIn(BaseModel):
    name: str
    code: Optional[str] = None
    color: str = "sky"
    desc: str = ""
    start: str = "default"  # default | copy | blank
    copy_from: Optional[str] = None
    members: List[str] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    color: Optional[str] = None
    desc: Optional[str] = None


class StagesIn(BaseModel):
    stages: List[StageIn]
    moves: Dict[str, str] = {}


class GroupIn(BaseModel):
    name: str
    color: str = "sky"


class MemberIn(BaseModel):
    user_id: str
    role: str = "membro"


class TagIn(BaseModel):
    name: str
    color: str = "slate"


class DemandIn(BaseModel):
    project_id: str
    group_id: Optional[str] = None
    title: str
    desc: str = ""
    resp_id: Optional[str] = None
    solic_id: Optional[str] = None
    stage_id: Optional[str] = None
    due: Optional[str] = None
    prio: str = "media"
    tags: List[TagIn] = []


class DemandUpdate(BaseModel):
    title: Optional[str] = None
    desc: Optional[str] = None
    resp_id: Optional[str] = None
    solic_id: Optional[str] = None
    stage_id: Optional[str] = None
    group_id: Optional[str] = None
    due: Optional[str] = None
    clear_due: bool = False
    prio: Optional[str] = None
    tags: Optional[List[TagIn]] = None


class BulkIn(BaseModel):
    ids: List[str]
    action: str  # stage | assign | delete | group
    value: Optional[str] = None


class CommentIn(BaseModel):
    text: str


class SettingsIn(BaseModel):
    default_stages: Optional[List[StageIn]] = None
    tags: Optional[List[TagIn]] = None
    notif: Optional[Dict[str, bool]] = None


# ---------------------------------------------------------------- auth routes
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(400, "E-mail inválido")
    if len(body.password) < 8:
        raise HTTPException(400, "A senha precisa ter pelo menos 8 caracteres")
    if not body.name.strip():
        raise HTTPException(400, "Informe seu nome")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Já existe uma conta com este e-mail")
    name = body.name.strip()
    user = {
        "id": new_id(), "email": email, "password_hash": hash_pw(body.password), "name": name,
        "short": name.split(" ")[0], "role": (body.role or "").strip(), "phone": "", "about": "",
        "color": initials_color(email), "created_at": now_iso(), "last_seen": now_iso(),
    }
    await db.users.insert_one(dict(user))
    await get_settings(user["id"])
    # pending invites for this email become contacts
    invites = await db.invites.find({"email": email}, {"_id": 0}).to_list(500)
    for inv in invites:
        await connect(user["id"], inv["by"])
        await notify(inv["by"], f"{user['short']} aceitou seu convite e entrou no Olabs", kind="team", actor=user["id"])
    await db.invites.delete_many({"email": email})
    return {"token": make_token(user["id"]), "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.strip().lower()}, {"_id": 0})
    if not user or not check_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "E-mail ou senha incorretos")
    return {"token": make_token(user["id"]), "user": public_user(user)}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return public_user(user)


@api.put("/auth/password")
async def change_password(body: PasswordIn, user=Depends(current_user)):
    if not check_pw(body.current, user["password_hash"]):
        raise HTTPException(400, "Senha atual incorreta")
    if len(body.new) < 8:
        raise HTTPException(400, "A nova senha precisa ter pelo menos 8 caracteres")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new)}})
    return {"ok": True}


# ---------------------------------------------------------------- profile
@api.put("/users/me")
async def update_me(body: ProfileIn, user=Depends(current_user)):
    upd = {k: v.strip() if isinstance(v, str) else v for k, v in body.model_dump(exclude_none=True).items()}
    if "email" in upd:
        upd["email"] = upd["email"].lower()
        if upd["email"] != user["email"]:
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", upd["email"]):
                raise HTTPException(400, "E-mail inválido")
            if await db.users.find_one({"email": upd["email"]}):
                raise HTTPException(400, "Este e-mail já está em uso")
    if "name" in upd and not upd["name"]:
        raise HTTPException(400, "O nome não pode ficar vazio")
    if "color" in upd and upd["color"] not in COLORS:
        upd.pop("color")
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return public_user(await db.users.find_one({"id": user["id"]}, {"_id": 0}))


@api.post("/users/me/avatar")
async def upload_avatar(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Envie uma imagem")
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "A foto pode ter no máximo 5 MB")
    ext = (file.filename or "a.png").rsplit(".", 1)[-1].lower()
    res = put_object(f"{APP_NAME}/avatars/{user['id']}/{uuid.uuid4()}.{ext}", data, file.content_type)
    v = uuid.uuid4().hex[:8]
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar_path": res["path"], "avatar_type": file.content_type, "avatar_v": v}})
    return public_user(await db.users.find_one({"id": user["id"]}, {"_id": 0}))


@api.delete("/users/me/avatar")
async def delete_avatar(user=Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$unset": {"avatar_path": "", "avatar_type": "", "avatar_v": ""}})
    return public_user(await db.users.find_one({"id": user["id"]}, {"_id": 0}))


@api.get("/users/{uid}/avatar")
async def get_avatar(uid: str, auth: Optional[str] = Query(None)):
    await _user_from_token(auth)
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u or not u.get("avatar_path"):
        raise HTTPException(404, "Sem foto")
    data, ct = get_object(u["avatar_path"])
    return Response(content=data, media_type=u.get("avatar_type") or ct, headers={"Cache-Control": "private, max-age=86400"})


# ---------------------------------------------------------------- team / contacts
@api.get("/team")
async def team(user=Depends(current_user)):
    ids = await contact_ids(user["id"])
    # also include people who share a project with me
    projs = await db.projects.find({"members.user_id": user["id"]}, {"_id": 0, "members": 1}).to_list(1000)
    shared = {m["user_id"] for p in projs for m in p["members"]}
    all_ids = list(set(ids) | shared | {user["id"]})
    users = await db.users.find({"id": {"$in": all_ids}}, {"_id": 0}).to_list(2000)
    people = []
    for u in users:
        pu = public_user(u)
        pu["is_contact"] = u["id"] in ids
        pu["is_me"] = u["id"] == user["id"]
        people.append(pu)
    invites = await db.invites.find({"by": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"people": people, "invites": invites}


@api.post("/team/add")
async def add_person(body: AddPersonIn, user=Depends(current_user)):
    email = body.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(400, "E-mail inválido")
    if email == user["email"]:
        raise HTTPException(400, "Este é o seu próprio e-mail")
    other = await db.users.find_one({"email": email}, {"_id": 0})
    if other:
        await connect(user["id"], other["id"])
        await notify(other["id"], f"{user['short']} adicionou você à equipe", kind="team", actor=user["id"])
        return {"status": "added", "user": public_user(other)}
    existing = await db.invites.find_one({"email": email, "by": user["id"]}, {"_id": 0})
    if existing:
        await db.invites.update_one({"id": existing["id"]}, {"$set": {"created_at": now_iso()}})
        return {"status": "invited", "invite": {**existing, "created_at": now_iso()}}
    inv = {"id": new_id(), "email": email, "by": user["id"], "created_at": now_iso()}
    await db.invites.insert_one(dict(inv))
    return {"status": "invited", "invite": inv}


@api.delete("/team/{uid}")
async def remove_contact(uid: str, user=Depends(current_user)):
    await db.contacts.delete_many({"$or": [{"user_id": user["id"], "contact_id": uid}, {"user_id": uid, "contact_id": user["id"]}]})
    return {"ok": True}


@api.delete("/invites/{iid}")
async def cancel_invite(iid: str, user=Depends(current_user)):
    await db.invites.delete_one({"id": iid, "by": user["id"]})
    return {"ok": True}


# ---------------------------------------------------------------- projects
def project_role(p: dict, uid: str) -> Optional[str]:
    for m in p.get("members", []):
        if m["user_id"] == uid:
            return m["role"]
    return None


async def get_project_for(pid: str, user: dict, admin: bool = False) -> dict:
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Projeto não encontrado")
    role = project_role(p, user["id"])
    if not role:
        raise HTTPException(403, "Você não participa deste projeto")
    if admin and role != "admin":
        raise HTTPException(403, "Só administradores do projeto podem fazer isso")
    return p


def present_project(p: dict, uid: str) -> dict:
    out = clean(p)
    out["fav"] = uid in p.get("fav_by", [])
    out["my_role"] = project_role(p, uid)
    out.pop("fav_by", None)
    return out


def make_code(name: str) -> str:
    words = [w for w in re.split(r"\s+", re.sub(r"[^\wÀ-ÿ ]", "", name)) if w and len(w) > 2] or [name or "PR"]
    code = (words[0][0] + (words[1][0] if len(words) > 1 else words[0][1:2])).upper()
    import unicodedata
    code = unicodedata.normalize("NFKD", code).encode("ascii", "ignore").decode() or "PR"
    return code[:3]


async def touch_project(pid: str):
    await db.projects.update_one({"id": pid}, {"$set": {"updated_at": now_iso()}})


@api.get("/projects")
async def list_projects(user=Depends(current_user)):
    ps = await db.projects.find({"members.user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return [present_project(p, user["id"]) for p in ps]


@api.post("/projects")
async def create_project(body: ProjectIn, user=Depends(current_user)):
    if not body.name.strip():
        raise HTTPException(400, "Dê um nome ao projeto")
    settings = await get_settings(user["id"])
    if body.start == "copy" and body.copy_from:
        src = await get_project_for(body.copy_from, user)
        stages = [{"name": s["name"], "color": s["color"], "kind": s["kind"]} for s in src["stages"]]
    elif body.start == "blank":
        stages = [{"name": "Pedido", "color": "sky", "kind": "todo"}]
    else:
        stages = settings.get("default_stages") or DEFAULT_STAGES
    stages = [{"id": new_id(), "name": s["name"], "color": s["color"], "kind": s["kind"]} for s in stages]
    contacts = set(await contact_ids(user["id"]))
    members = [{"user_id": user["id"], "role": "admin"}]
    for mid in body.members:
        if mid in contacts and mid != user["id"]:
            members.append({"user_id": mid, "role": "membro"})
    code = (body.code or "").strip().upper()[:3] or make_code(body.name)
    p = {
        "id": new_id(), "name": body.name.strip(), "code": code, "color": body.color if body.color in COLORS else "sky",
        "desc": body.desc.strip(), "owner_id": user["id"], "members": members, "stages": stages,
        "groups": [{"id": new_id(), "name": "Demandas", "color": "sky"}],
        "fav_by": [], "archived": False, "archived_at": None, "seq": 0,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.projects.insert_one(dict(p))
    for m in members:
        if m["user_id"] != user["id"]:
            await notify(m["user_id"], f"{user['short']} incluiu você no projeto {p['name']}", kind="project", actor=user["id"], project_id=p["id"])
    await log_activity(user, p["id"], None, "folder-plus", "criou o projeto", p["name"])
    return present_project(p, user["id"])


@api.put("/projects/{pid}")
async def update_project(pid: str, body: ProjectUpdate, user=Depends(current_user)):
    await get_project_for(pid, user, admin=True)
    upd = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump(exclude_none=True).items()}
    if "code" in upd:
        upd["code"] = upd["code"].upper()[:3] or "PR"
    if "name" in upd and not upd["name"]:
        raise HTTPException(400, "O nome não pode ficar vazio")
    if "color" in upd and upd["color"] not in COLORS:
        upd.pop("color")
    upd["updated_at"] = now_iso()
    await db.projects.update_one({"id": pid}, {"$set": upd})
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.post("/projects/{pid}/favorite")
async def toggle_fav(pid: str, user=Depends(current_user)):
    p = await get_project_for(pid, user)
    if user["id"] in p.get("fav_by", []):
        await db.projects.update_one({"id": pid}, {"$pull": {"fav_by": user["id"]}})
    else:
        await db.projects.update_one({"id": pid}, {"$addToSet": {"fav_by": user["id"]}})
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.post("/projects/{pid}/archive")
async def archive_project(pid: str, user=Depends(current_user)):
    await get_project_for(pid, user, admin=True)
    await db.projects.update_one({"id": pid}, {"$set": {"archived": True, "archived_at": now_iso()}})
    return {"ok": True}


@api.post("/projects/{pid}/restore")
async def restore_project(pid: str, user=Depends(current_user)):
    await get_project_for(pid, user, admin=True)
    await db.projects.update_one({"id": pid}, {"$set": {"archived": False, "archived_at": None, "updated_at": now_iso()}})
    return {"ok": True}


@api.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(current_user)):
    p = await get_project_for(pid, user, admin=True)
    if p["owner_id"] != user["id"]:
        raise HTTPException(403, "Só quem criou o projeto pode excluí-lo")
    await db.projects.delete_one({"id": pid})
    await db.demands.delete_many({"project_id": pid})
    await db.comments.delete_many({"project_id": pid})
    await db.files.update_many({"project_id": pid}, {"$set": {"is_deleted": True}})
    await db.activity.delete_many({"project_id": pid})
    return {"ok": True}


@api.put("/projects/{pid}/stages")
async def save_stages(pid: str, body: StagesIn, user=Depends(current_user)):
    p = await get_project_for(pid, user, admin=True)
    if not body.stages:
        raise HTTPException(400, "O projeto precisa de pelo menos uma etapa")
    stages = []
    for s in body.stages:
        if not s.name.strip():
            raise HTTPException(400, "Toda etapa precisa de um nome")
        stages.append({"id": s.id or new_id(), "name": s.name.strip(), "color": s.color if s.color in COLORS else "slate",
                       "kind": s.kind if s.kind in KINDS else "todo"})
    new_ids = {s["id"] for s in stages}
    fallback = stages[0]["id"]
    for old in p["stages"]:
        if old["id"] not in new_ids:
            target = body.moves.get(old["id"]) if body.moves.get(old["id"]) in new_ids else fallback
            await db.demands.update_many({"project_id": pid, "stage_id": old["id"]}, {"$set": {"stage_id": target}})
    await db.projects.update_one({"id": pid}, {"$set": {"stages": stages, "updated_at": now_iso()}})
    # keep done_at coherent
    done_ids = [s["id"] for s in stages if s["kind"] == "done"]
    await db.demands.update_many({"project_id": pid, "stage_id": {"$in": done_ids}, "done_at": None}, {"$set": {"done_at": now_iso()}})
    await db.demands.update_many({"project_id": pid, "stage_id": {"$nin": done_ids}}, {"$set": {"done_at": None}})
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.post("/projects/{pid}/groups")
async def add_group(pid: str, body: GroupIn, user=Depends(current_user)):
    await get_project_for(pid, user)
    if not body.name.strip():
        raise HTTPException(400, "Dê um nome ao grupo")
    g = {"id": new_id(), "name": body.name.strip(), "color": body.color if body.color in COLORS else "sky"}
    await db.projects.update_one({"id": pid}, {"$push": {"groups": g}, "$set": {"updated_at": now_iso()}})
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.put("/projects/{pid}/groups/{gid}")
async def update_group(pid: str, gid: str, body: GroupIn, user=Depends(current_user)):
    await get_project_for(pid, user)
    if not body.name.strip():
        raise HTTPException(400, "Dê um nome ao grupo")
    await db.projects.update_one({"id": pid, "groups.id": gid},
                                 {"$set": {"groups.$.name": body.name.strip(), "groups.$.color": body.color if body.color in COLORS else "sky"}})
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.delete("/projects/{pid}/groups/{gid}")
async def delete_group(pid: str, gid: str, move_to: Optional[str] = None, user=Depends(current_user)):
    p = await get_project_for(pid, user)
    rest = [g for g in p["groups"] if g["id"] != gid]
    if not rest:
        raise HTTPException(400, "O projeto precisa de pelo menos um grupo")
    target = move_to if any(g["id"] == move_to for g in rest) else rest[0]["id"]
    await db.demands.update_many({"project_id": pid, "group_id": gid}, {"$set": {"group_id": target}})
    await db.projects.update_one({"id": pid}, {"$set": {"groups": rest, "updated_at": now_iso()}})
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.post("/projects/{pid}/members")
async def add_member(pid: str, body: MemberIn, user=Depends(current_user)):
    p = await get_project_for(pid, user, admin=True)
    if project_role(p, body.user_id):
        raise HTTPException(400, "Essa pessoa já participa do projeto")
    if body.user_id not in await contact_ids(user["id"]):
        raise HTTPException(400, "Adicione a pessoa à sua equipe antes de incluí-la no projeto")
    role = body.role if body.role in ("admin", "membro") else "membro"
    await db.projects.update_one({"id": pid}, {"$push": {"members": {"user_id": body.user_id, "role": role}}, "$set": {"updated_at": now_iso()}})
    await notify(body.user_id, f"{user['short']} incluiu você no projeto {p['name']}", kind="project", actor=user["id"], project_id=pid)
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.put("/projects/{pid}/members/{uid}")
async def update_member(pid: str, uid: str, body: MemberIn, user=Depends(current_user)):
    p = await get_project_for(pid, user, admin=True)
    if uid == p["owner_id"]:
        raise HTTPException(400, "Quem criou o projeto continua administrador")
    role = body.role if body.role in ("admin", "membro") else "membro"
    await db.projects.update_one({"id": pid, "members.user_id": uid}, {"$set": {"members.$.role": role}})
    return present_project(await db.projects.find_one({"id": pid}, {"_id": 0}), user["id"])


@api.delete("/projects/{pid}/members/{uid}")
async def remove_member(pid: str, uid: str, user=Depends(current_user)):
    p = await get_project_for(pid, user, admin=(uid != user["id"]))
    if uid == p["owner_id"]:
        raise HTTPException(400, "Quem criou o projeto não pode ser removido")
    await db.projects.update_one({"id": pid}, {"$pull": {"members": {"user_id": uid}}, "$set": {"updated_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------- notifications / activity
async def notify(uid: str, text: str, kind: str = "info", actor: Optional[str] = None,
                 demand_id: Optional[str] = None, project_id: Optional[str] = None, pref: Optional[str] = None, key: Optional[str] = None):
    if pref:
        s = await get_settings(uid)
        if not s["notif"].get(pref, True):
            return
    if key and await db.notifications.find_one({"user_id": uid, "key": key}):
        return
    await db.notifications.insert_one({"id": new_id(), "user_id": uid, "text": text, "kind": kind, "actor": actor,
                                       "demand_id": demand_id, "project_id": project_id, "read": False,
                                       "key": key, "created_at": now_iso()})


async def log_activity(user: dict, pid: str, demand: Optional[dict], icon: str, verb: str, target: str):
    await db.activity.insert_one({"id": new_id(), "project_id": pid, "demand_id": demand["id"] if demand else None,
                                  "who": user["id"], "icon": icon, "verb": verb, "target": target,
                                  "target_title": demand["title"] if demand else "", "created_at": now_iso()})


@api.get("/notifications")
async def list_notifications(user=Depends(current_user)):
    # lazily create "due tomorrow" reminders
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    projs = await db.projects.find({"members.user_id": user["id"], "archived": False}, {"_id": 0, "id": 1, "stages": 1}).to_list(1000)
    done = {s["id"] for p in projs for s in p["stages"] if s["kind"] == "done"}
    due = await db.demands.find({"resp_id": user["id"], "due": tomorrow, "project_id": {"$in": [p["id"] for p in projs]}}, {"_id": 0}).to_list(200)
    for d in due:
        if d["stage_id"] not in done:
            await notify(user["id"], f"{d['code']} vence amanhã: {d['title']}", kind="due", demand_id=d["id"],
                         project_id=d["project_id"], pref="due_soon", key=f"due:{d['id']}:{tomorrow}")
    rows = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(40)
    return rows


@api.post("/notifications/read-all")
async def read_all(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def read_one(nid: str, user=Depends(current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/activity")
async def activity(limit: int = 12, user=Depends(current_user)):
    projs = await db.projects.find({"members.user_id": user["id"]}, {"_id": 0, "id": 1}).to_list(1000)
    rows = await db.activity.find({"project_id": {"$in": [p["id"] for p in projs]}}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 50))
    return rows


# ---------------------------------------------------------------- settings
@api.get("/settings")
async def read_settings(user=Depends(current_user)):
    s = await get_settings(user["id"])
    s.pop("user_id", None)
    return s


@api.put("/settings")
async def write_settings(body: SettingsIn, user=Depends(current_user)):
    await get_settings(user["id"])
    upd: Dict[str, Any] = {}
    if body.default_stages is not None:
        if not body.default_stages:
            raise HTTPException(400, "Mantenha pelo menos uma etapa padrão")
        upd["default_stages"] = [{"name": s.name.strip() or "Etapa", "color": s.color if s.color in COLORS else "slate",
                                  "kind": s.kind if s.kind in KINDS else "todo"} for s in body.default_stages]
    if body.tags is not None:
        seen, tags = set(), []
        for t in body.tags:
            n = t.name.strip().lower()
            if n and n not in seen:
                seen.add(n)
                tags.append({"name": n, "color": t.color if t.color in COLORS else "slate"})
        upd["tags"] = tags
    if body.notif is not None:
        upd["notif"] = {k: bool(body.notif.get(k, v)) for k, v in DEFAULT_NOTIF.items()}
    if upd:
        await db.settings.update_one({"user_id": user["id"]}, {"$set": upd})
    s = await get_settings(user["id"])
    s.pop("user_id", None)
    return s


# ---------------------------------------------------------------- demands
async def my_project_ids(uid: str, include_archived: bool = False) -> List[str]:
    q: Dict[str, Any] = {"members.user_id": uid}
    if not include_archived:
        q["archived"] = False
    ps = await db.projects.find(q, {"_id": 0, "id": 1}).to_list(1000)
    return [p["id"] for p in ps]


async def get_demand_for(did: str, user: dict):
    d = await db.demands.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Demanda não encontrada")
    p = await get_project_for(d["project_id"], user)
    return d, p


def is_member(p: dict, uid: Optional[str]) -> bool:
    return bool(uid) and any(m["user_id"] == uid for m in p["members"])


def norm_tags(tags: List[TagIn]) -> List[dict]:
    seen, out = set(), []
    for t in tags:
        n = t.name.strip().lower()
        if n and n not in seen:
            seen.add(n)
            out.append({"name": n, "color": t.color if t.color in COLORS else "slate"})
    return out


def valid_date(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    try:
        return date.fromisoformat(v[:10]).isoformat()
    except ValueError:
        raise HTTPException(400, "Data inválida")


@api.get("/demands")
async def list_demands(project_id: Optional[str] = None, user=Depends(current_user)):
    if project_id:
        await get_project_for(project_id, user)
        q = {"project_id": project_id}
    else:
        q = {"project_id": {"$in": await my_project_ids(user["id"])}}
    return await db.demands.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)


@api.post("/demands")
async def create_demand(body: DemandIn, user=Depends(current_user)):
    p = await get_project_for(body.project_id, user)
    if p.get("archived"):
        raise HTTPException(400, "Restaure o projeto para criar demandas")
    if not body.title.strip():
        raise HTTPException(400, "Dê um título à demanda")
    stage_id = body.stage_id if any(s["id"] == body.stage_id for s in p["stages"]) else p["stages"][0]["id"]
    group_id = body.group_id if any(g["id"] == body.group_id for g in p["groups"]) else p["groups"][0]["id"]
    resp = body.resp_id if is_member(p, body.resp_id) else user["id"]
    solic = body.solic_id if is_member(p, body.solic_id) else user["id"]
    upd = await db.projects.find_one_and_update({"id": p["id"]}, {"$inc": {"seq": 1}, "$set": {"updated_at": now_iso()}},
                                                return_document=True, projection={"_id": 0, "seq": 1})
    kind = next(s["kind"] for s in p["stages"] if s["id"] == stage_id)
    d = {
        "id": new_id(), "code": f"{p['code']}-{upd['seq']:03d}", "project_id": p["id"], "group_id": group_id,
        "title": body.title.strip(), "desc": body.desc.strip(), "resp_id": resp, "solic_id": solic,
        "stage_id": stage_id, "due": valid_date(body.due), "prio": body.prio if body.prio in PRIOS else "media",
        "tags": norm_tags(body.tags), "files": 0, "comments": 0, "created_by": user["id"],
        "created_at": now_iso(), "updated_at": now_iso(), "done_at": now_iso() if kind == "done" else None,
    }
    await db.demands.insert_one(dict(d))
    await log_activity(user, p["id"], d, "plus", "criou", d["code"])
    if resp != user["id"]:
        await notify(resp, f"{user['short']} atribuiu a você {d['code']}: {d['title']}", kind="assigned",
                     actor=user["id"], demand_id=d["id"], project_id=p["id"], pref="assigned")
    return d


@api.put("/demands/{did}")
async def update_demand(did: str, body: DemandUpdate, user=Depends(current_user)):
    d, p = await get_demand_for(did, user)
    upd: Dict[str, Any] = {}
    data = body.model_dump(exclude_none=True)
    if "title" in data:
        if not data["title"].strip():
            raise HTTPException(400, "O título não pode ficar vazio")
        upd["title"] = data["title"].strip()
    if "desc" in data:
        upd["desc"] = data["desc"].strip()
    for f in ("resp_id", "solic_id"):
        if f in data:
            if not is_member(p, data[f]):
                raise HTTPException(400, "A pessoa precisa participar do projeto")
            upd[f] = data[f]
    if "stage_id" in data:
        st = next((s for s in p["stages"] if s["id"] == data["stage_id"]), None)
        if not st:
            raise HTTPException(400, "Etapa inválida")
        upd["stage_id"] = st["id"]
        if st["kind"] == "done" and not d.get("done_at"):
            upd["done_at"] = now_iso()
        elif st["kind"] != "done":
            upd["done_at"] = None
    if "group_id" in data:
        if not any(g["id"] == data["group_id"] for g in p["groups"]):
            raise HTTPException(400, "Grupo inválido")
        upd["group_id"] = data["group_id"]
    if body.clear_due:
        upd["due"] = None
    elif "due" in data:
        upd["due"] = valid_date(data["due"])
    if "prio" in data and data["prio"] in PRIOS:
        upd["prio"] = data["prio"]
    if body.tags is not None:
        upd["tags"] = norm_tags(body.tags)
    if not upd:
        return d
    upd["updated_at"] = now_iso()
    await db.demands.update_one({"id": did}, {"$set": upd})
    await touch_project(p["id"])
    nd = await db.demands.find_one({"id": did}, {"_id": 0})
    if "stage_id" in upd and upd["stage_id"] != d["stage_id"]:
        st = next(s for s in p["stages"] if s["id"] == upd["stage_id"])
        await log_activity(user, p["id"], nd, "move-right", f"moveu para {st['name']}", nd["code"])
        for uid in {nd["resp_id"], nd["solic_id"]} - {user["id"]}:
            await notify(uid, f"{user['short']} moveu {nd['code']} para {st['name']}", kind="stage", actor=user["id"],
                         demand_id=did, project_id=p["id"], pref="comments")
    if "resp_id" in upd and upd["resp_id"] != d["resp_id"] and upd["resp_id"] != user["id"]:
        await notify(upd["resp_id"], f"{user['short']} atribuiu a você {nd['code']}: {nd['title']}", kind="assigned",
                     actor=user["id"], demand_id=did, project_id=p["id"], pref="assigned")
    return nd


@api.post("/demands/bulk")
async def bulk(body: BulkIn, user=Depends(current_user)):
    n = 0
    for did in body.ids:
        try:
            d, p = await get_demand_for(did, user)
        except HTTPException:
            continue
        if body.action == "delete":
            await _delete_demand(d)
        elif body.action == "stage":
            await update_demand(did, DemandUpdate(stage_id=body.value), user)
        elif body.action == "assign":
            await update_demand(did, DemandUpdate(resp_id=body.value), user)
        elif body.action == "group":
            await update_demand(did, DemandUpdate(group_id=body.value), user)
        n += 1
    return {"ok": True, "count": n}


async def _delete_demand(d: dict):
    await db.demands.delete_one({"id": d["id"]})
    await db.comments.delete_many({"demand_id": d["id"]})
    await db.files.update_many({"demand_id": d["id"]}, {"$set": {"is_deleted": True}})
    await db.activity.delete_many({"demand_id": d["id"]})


@api.delete("/demands/{did}")
async def delete_demand(did: str, user=Depends(current_user)):
    d, p = await get_demand_for(did, user)
    await _delete_demand(d)
    await touch_project(p["id"])
    return {"ok": True}


# ---------------------------------------------------------------- comments
@api.get("/demands/{did}/comments")
async def list_comments(did: str, user=Depends(current_user)):
    await get_demand_for(did, user)
    return await db.comments.find({"demand_id": did}, {"_id": 0}).sort("created_at", 1).to_list(2000)


def _slug(s: str) -> str:
    import unicodedata
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().replace(" ", "")


@api.post("/demands/{did}/comments")
async def add_comment(did: str, body: CommentIn, user=Depends(current_user)):
    d, p = await get_demand_for(did, user)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Escreva algo antes de enviar")
    c = {"id": new_id(), "demand_id": did, "project_id": p["id"], "by": user["id"], "text": text, "created_at": now_iso()}
    await db.comments.insert_one(dict(c))
    await db.demands.update_one({"id": did}, {"$inc": {"comments": 1}, "$set": {"updated_at": now_iso()}})
    await touch_project(p["id"])
    await log_activity(user, p["id"], d, "message-circle", "comentou em", d["code"])
    # mentions
    tokens = {_slug(t) for t in re.findall(r"@([\wÀ-ÿ.]+)", text)}
    mentioned = set()
    if tokens:
        members = await db.users.find({"id": {"$in": [m["user_id"] for m in p["members"]]}}, {"_id": 0}).to_list(500)
        for m in members:
            keys = {_slug(m.get("short", "")), _slug(m.get("name", "")), _slug(m.get("name", "").split(" ")[0])}
            if tokens & keys and m["id"] != user["id"]:
                mentioned.add(m["id"])
                await notify(m["id"], f"{user['short']} mencionou você em {d['code']}: “{text[:80]}”", kind="mention",
                             actor=user["id"], demand_id=did, project_id=p["id"], pref="mentions")
    for uid in {d["resp_id"], d["solic_id"]} - {user["id"]} - mentioned:
        await notify(uid, f"{user['short']} comentou em {d['code']}: “{text[:80]}”", kind="comment",
                     actor=user["id"], demand_id=did, project_id=p["id"], pref="comments")
    return c


@api.delete("/comments/{cid}")
async def delete_comment(cid: str, user=Depends(current_user)):
    c = await db.comments.find_one({"id": cid}, {"_id": 0})
    if not c or c["by"] != user["id"]:
        raise HTTPException(404, "Comentário não encontrado")
    await db.comments.delete_one({"id": cid})
    await db.demands.update_one({"id": c["demand_id"]}, {"$inc": {"comments": -1}})
    return {"ok": True}


# ---------------------------------------------------------------- files
def file_kind(name: str, ct: str) -> str:
    ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
    if (ct or "").startswith("image/") or ext in ("png", "jpg", "jpeg", "gif", "webp", "svg", "heic"):
        return "image"
    if ext in ("xls", "xlsx", "csv", "ods", "numbers", "tsv") or "spreadsheet" in (ct or "") or ct == "text/csv":
        return "sheet"
    if ext == "pdf" or ct == "application/pdf":
        return "pdf"
    if ext in ("mp4", "mov", "avi", "webm", "mkv") or (ct or "").startswith("video/"):
        return "video"
    return "other"


@api.post("/demands/{did}/files")
async def upload_file(did: str, file: UploadFile = File(...), user=Depends(current_user)):
    d, p = await get_demand_for(did, user)
    data = await file.read()
    if not data:
        raise HTTPException(400, "Arquivo vazio")
    if len(data) > MAX_FILE:
        raise HTTPException(400, "O arquivo pode ter no máximo 25 MB")
    name = file.filename or "arquivo"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else "bin"
    ct = file.content_type or "application/octet-stream"
    try:
        res = put_object(f"{APP_NAME}/uploads/{p['id']}/{uuid.uuid4()}.{ext}", data, ct)
    except requests.HTTPError as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(502, "Não foi possível enviar o arquivo agora. Tente de novo.")
    f = {"id": new_id(), "demand_id": did, "project_id": p["id"], "storage_path": res["path"], "name": name,
         "content_type": ct, "size": res.get("size", len(data)), "type": file_kind(name, ct), "by": user["id"],
         "is_deleted": False, "created_at": now_iso()}
    await db.files.insert_one(dict(f))
    await db.demands.update_one({"id": did}, {"$inc": {"files": 1}, "$set": {"updated_at": now_iso()}})
    await touch_project(p["id"])
    await log_activity(user, p["id"], d, "paperclip", "enviou um anexo em", d["code"])
    f.pop("storage_path")
    return f


@api.get("/demands/{did}/files")
async def demand_files(did: str, user=Depends(current_user)):
    await get_demand_for(did, user)
    return await db.files.find({"demand_id": did, "is_deleted": False}, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(500)


@api.get("/projects/{pid}/files")
async def project_files(pid: str, user=Depends(current_user)):
    await get_project_for(pid, user)
    return await db.files.find({"project_id": pid, "is_deleted": False}, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(2000)


@api.get("/files/{fid}/download")
async def download_file(fid: str, inline: bool = False, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    token = auth or (authorization.split(" ", 1)[1] if authorization and authorization.lower().startswith("bearer ") else None)
    user = await _user_from_token(token)
    f = await db.files.find_one({"id": fid, "is_deleted": False}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Arquivo não encontrado")
    await get_project_for(f["project_id"], user)
    data, ct = get_object(f["storage_path"])
    from urllib.parse import quote
    disp = "inline" if inline else "attachment"
    return Response(content=data, media_type=f.get("content_type") or ct,
                    headers={"Content-Disposition": f"{disp}; filename*=UTF-8''{quote(f['name'])}"})


@api.delete("/files/{fid}")
async def delete_file(fid: str, user=Depends(current_user)):
    f = await db.files.find_one({"id": fid, "is_deleted": False}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Arquivo não encontrado")
    p = await get_project_for(f["project_id"], user)
    if f["by"] != user["id"] and project_role(p, user["id"]) != "admin":
        raise HTTPException(403, "Só quem enviou ou um administrador pode remover")
    await db.files.update_one({"id": fid}, {"$set": {"is_deleted": True}})
    await db.demands.update_one({"id": f["demand_id"]}, {"$inc": {"files": -1}})
    return {"ok": True}


@api.get("/")
async def root():
    return {"message": "Olabs API"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.projects.create_index("id", unique=True)
    await db.demands.create_index("id", unique=True)
    await db.demands.create_index("project_id")
    await db.comments.create_index("demand_id")
    await db.files.create_index("project_id")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.contacts.create_index([("user_id", 1), ("contact_id", 1)], unique=True)
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
