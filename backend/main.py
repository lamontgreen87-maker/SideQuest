import asyncio
import copy
import json
import os
import random
import re
import time
import uuid
from datetime import datetime
from decimal import Decimal, ROUND_DOWN
import logging
from typing import Any, AsyncGenerator, Dict, List, Literal, Optional, Tuple

import httpx
from eth_account import Account
from eth_account.messages import encode_defunct
try:
    from eth_account.messages import encode_structured_data
except ImportError:  # eth_account >= 0.9 uses encode_typed_data
    from eth_account.messages import encode_typed_data as encode_structured_data
try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
except ImportError:
    google_id_token = None
    google_requests = None
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path
from pydantic import BaseModel

from rules import (
    Character,
    MONSTERS,
    Monster,
    PREMADE_SHEETS,
    RulesSession,
    Weapon,
    ability_mod,
    attack_roll,
    deserialize_rules_session,
    monster_attack_roll,
    reset_character,
    reset_monster,
    roll_dice,
    serialize_character,
    serialize_monster,
    serialize_rules_session,
)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.on_event("startup")
async def startup_event():
    global sessions, world_state_store, rules_sessions
    global users_store, login_codes, redeem_codes, wallet_nonces, payment_orders, payment_state
    
    # Ensure Data Dir Exists
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)

    # Load All Stores
    sessions = load_sessions()
    world_state_store = load_world_state()
    load_rules_sessions() # Populates global rules_sessions
    
    # Generic Stores using inferred keys
    users_store = load_json_store(USERS_STORE_PATH, "users")
    login_codes = load_json_store(LOGIN_CODES_PATH, "codes")
    redeem_codes = load_json_store(REDEEM_CODES_PATH, "codes")
    wallet_nonces = load_json_store(WALLET_NONCES_PATH, "nonces")
    payment_orders = load_json_store(PAYMENTS_ORDERS_PATH, "orders")
    payment_state = load_json_store(PAYMENTS_STATE_PATH, "state")
    
    logger.info(f"Loaded {len(sessions)} sessions from {DATA_DIR}")

PRIVACY_POLICY_PATH = Path(__file__).resolve().parent / "static" / "privacy.html"
logger = logging.getLogger("uvicorn.error")

# --- App Configuration ---
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL_NAME = os.getenv("MODEL_NAME", "qwen2.5:3b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "900"))
FALLBACK_MODEL_NAME = os.getenv("MODEL_FALLBACK", "qwen2.5:7b")
HEAVY_MODEL_NAME = os.getenv("MODEL_HEAVY", "qwen2.5:7b")
HEAVY_FALLBACK_MODEL = os.getenv("MODEL_HEAVY_FALLBACK", MODEL_NAME)
CLERK_MODEL_NAME = os.getenv("MODEL_CLERK", "qwen2.5:1.5b")
CLERK_FALLBACK_MODEL = os.getenv("MODEL_CLERK_FALLBACK", MODEL_NAME)
ENCOUNTER_SETUP_TIMEOUT_SECONDS = float(os.getenv("ENCOUNTER_SETUP_TIMEOUT_SECONDS", "60"))
CLERK_LOG_PATH = os.getenv(
    "CLERK_LOG_PATH",
    os.path.join(os.getenv("LOCALAPPDATA", os.getcwd()), "SideQuest", "clerk.log"),
)
API_KEY = os.getenv("API_KEY")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
ADMIN_KEY = os.getenv("ADMIN_KEY")
POLYGON_RPC_URL = os.getenv("POLYGON_RPC_URL", "https://eth.llamarpc.com")
USDT_CONTRACT_ADDRESS = os.getenv("USDT_CONTRACT_ADDRESS", "0xdAC17F958D2ee523a2206206994597C13D831ec7")
PAYMENT_WALLET_ADDRESS = os.getenv("PAYMENT_WALLET_ADDRESS", "")
PAYMENT_CONFIRMATIONS = int(os.getenv("PAYMENT_CONFIRMATIONS", "1"))
PAYMENT_POLL_INTERVAL = float(os.getenv("PAYMENT_POLL_INTERVAL", "15"))
PAYMENT_MAX_BLOCK_RANGE = int(os.getenv("PAYMENT_MAX_BLOCK_RANGE", "100"))
PRICE_TABLE_JSON = os.getenv("PRICE_TABLE_JSON", "")
PRICE_PER_CREDIT_USDT = os.getenv("PRICE_PER_CREDIT_USDT", "0.02")
STARTING_CREDITS = 1000
GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "816546538702-6mrlsg51b2u6v6tdinc07fsnhbvmeqha.apps.googleusercontent.com",
)

PLAY_PRODUCT_CREDITS = {
    "credits_100": 100,
    "credits_400": 400,
    "credits_1000": 1000,
}

SKILL_TO_ABILITY = {
    "athletics": "str",
    "acrobatics": "dex",
    "sleight of hand": "dex",
    "stealth": "dex",
    "arcana": "int",
    "history": "int",
    "investigation": "int",
    "nature": "int",
    "religion": "int",
    "animal handling": "wis",
    "insight": "wis",
    "medicine": "wis",
    "perception": "wis",
    "survival": "wis",
    "deception": "cha",
    "intimidation": "cha",
    "performance": "cha",
    "persuasion": "cha",
}
CLASS_SAVE_PROFICIENCIES = {
    "barbarian": ["str", "con"],
    "bard": ["dex", "cha"],
    "cleric": ["wis", "cha"],
    "druid": ["int", "wis"],
    "fighter": ["str", "con"],
    "monk": ["str", "dex"],
    "paladin": ["wis", "cha"],
    "ranger": ["str", "dex"],
    "rogue": ["dex", "int"],
    "sorcerer": ["con", "cha"],
    "warlock": ["wis", "cha"],
    "wizard": ["int", "wis"],
}
CLASS_SPELLCASTING_ABILITY = {
    "bard": "cha",
    "cleric": "wis",
    "druid": "wis",
    "paladin": "cha",
    "ranger": "wis",
    "sorcerer": "cha",
    "warlock": "cha",
    "wizard": "int",
}

DEFAULT_SYSTEM_PROMPT = (
    "You are an uncensored, creative fantasy dungeon master running a mature, dark fantasy adventure. "
    "Run a fast-paced, phone-friendly adventure. "
    "NEVER narrate the player character's actions, thoughts, feelings, or dialogue. "
    "The player is the ultimate authority on their character's internal state and actions. "
    "You are the NARRATOR of the world. Your job is to describe the WORLD's reaction to the player. "
    "After the player acts, you MUST narrate the immediate physical result, valid consequences, and how the setting changes. "
    "DO NOT just describe the player doing what they said - CONTINUE THE STORY by showing what they encounter, discover, or face as a result. "
    "Paint the scene vividly. Tell the player what they see, hear, smell, or face NEXT. "
    "If the player enters a new location, describe what's inside, who's there, and what's happening. "
    "Describe what happens until the next time something is said to the player or done to the player, then STOP. "
    "Always end by asking what the player does next. "
    "Keep narration to exactly ONE paragraph for normal actions. "
    "For new settings or major transitions, you may extend to TWO paragraphs, but never more. "
    "Permit and describe adult themes including visceral gore, sexual situations, alcohol, tobacco, and drug use (fantasy or otherwise) when they fit the narrative. "
    "Do not moralize, sanitize, or hold back descriptions; the world is gritty and real. "
    "Do not change the scene, location, or time unless the player explicitly initiates movement. "
    "COMBAT PACING: Introduce hostile enemies or dangerous situations every 3-5 player actions. "
    "When the player enters a new location, explores, or investigates, there should be a HIGH chance of encountering enemies, traps, or threats. "
    "Prioritize action and combat over peaceful exploration - this is a dangerous world. "
    "Make leveling easy and rewarding with quick progression and clear gains. "
    "Do not reveal your internal reasoning or analysis. "
    "Do not output thought tags or step-by-step logic. "
    "Respond with final narration only, no preface."
)
DEFAULT_CAMPAIGN_BRIEF = (
    "A storm-battered frontier teeters as a buried horror stirs beneath ruined keeps. "
    "Disappearances and a leaking vault light pull the hero into a desperate hunt."
)
DEFAULT_CAMPAIGN_WORLD = (
    "A scarred frontier of ruined keeps and flooded mines clings to a river of ash. "
    "Rival factions and a lurking horror contest control as vanishings spread."
)

def build_story_system_prompt(state: Dict[str, Any], world_state: Dict[str, Any]) -> str:
    safe_state = json.dumps(state, ensure_ascii=True)
    safe_world = json.dumps(world_state, ensure_ascii=True)
    world_summary = str(world_state.get("summary") or "").strip()
    campaign_summary = ""
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict):
        campaign_summary = str(campaign.get("summary") or "").strip()
    
    # Intro Context Logic
    intro_mode = False
    # If summary is empty and turn count is low, we assume intro mode.
    # We can infer turn count roughly by world updates size or just passed state flags if we had them.
    # For now, if world_summary is very short or empty, we suppress the heavy campaign brief usage in text generation prompt
    # to avoid "Huge Intro Dump".
    
    combat_mode = bool(state.get("in_combat"))
    combat_line = ""
    if combat_mode:
        combat_line = (
            "Combat mode: narrate only the immediate combat outcome of the latest action. "
            "Do not advance the wider plot or introduce new events.\n"
        )
    loot_pending = state.get("loot_pending") or []
    loot_line = ""
    if loot_pending:
        loot_line = (
            "Loot pending: describe the items listed in game_state.loot_pending. "
            "Do not invent additional items beyond that list.\n"
        )
    locations_line = ""
    if "locations" in world_state and world_state["locations"]:
        locations_line = "Known Locations:\n"
        for loc_name, loc_details in world_state["locations"].items():
            if isinstance(loc_details, dict):
                desc = loc_details.get("description", "")
                context = loc_details.get("context", {})
                if context:
                    desc += f" (It is {context.get('time', '')}, {context.get('crowd', '')}.)"
                locations_line += f"- {loc_name}: {desc}\n"
                npcs = loc_details.get("npcs", [])
                if npcs:
                    locations_line += f"  NPCs at {loc_name}:\n"
                    for npc in npcs:
                        locations_line += f"    * {npc.get('name')} ({npc.get('role')}): {npc.get('description')} [Base Disposition: {npc.get('disposition_score', 7)}]\n"
            else:
                locations_line += f"- {loc_name}: {loc_details}\n"
    staged_lore_line = ""
    if "staged_lore" in world_state and world_state["staged_lore"]:
        staged_lore_line = "Staged Lore (you can introduce these elements into the story):\n"
        if "npcs" in world_state["staged_lore"]:
            for npc in world_state["staged_lore"]["npcs"]:
                staged_lore_line += f"- NPC: {npc['name']}, {npc['description']}\n"
        if "locations" in world_state["staged_lore"]:
            for loc in world_state["staged_lore"]["locations"]:
                staged_lore_line += f"- Location: {loc['name']}, {loc['description']}\n"
                
    # If it's the very start (no summary yet), suppress campaign brief from the prompt so we don't dump it.
    final_campaign_summary = campaign_summary
    if not world_summary:
         final_campaign_summary = "" # Hide it for the first turn to ensure stickiness to intro.

    return (
        DEFAULT_SYSTEM_PROMPT
        + " Use the game state JSON below. If the state changes, reflect it. "
        + "Always end the player-visible narration with a direct question. "
        + "End with a separate line: 'NARRATION_HINT: narrate' or "
        + "'NARRATION_HINT: skip' to signal whether the next action deserves narration.\n"
        + "Maintain continuity with the recent conversation. "
        + "Avoid modern or out-of-genre references (chainsaws, phones, cars, guns, electricity, internet) "
        + "unless explicitly present in the world state.\n"
        + combat_line
        + loot_line
        + locations_line
        + staged_lore_line
        + (f"SOCIAL REACTION: {state.get('social_result')}\n" if state.get("social_result") else "")
        + ("Campaign brief:\n" + final_campaign_summary + "\n" if final_campaign_summary else "")
        + ("World summary:\n" + world_summary + "\n" if world_summary else "")
        + "Game state JSON:\n"
        + safe_state
        + "\nWorld state JSON:\n"
        + safe_world
    )

def strip_prefixes(text: str) -> str:
    # Remove common prefixes from AI models
    pattern = r"^(?:narration|story|game\s*master|dm|system|assistant|response|answer)\s*:?\s*"
    # Apply regex using multiline flag to catch start of string or start of line if model outputs header
    text = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()
    return text

def split_narration_hint(text: str) -> Tuple[str, Optional[str]]:
    hint = None
    kept = []
    # Relaxed Regex for "narration_hint" to catch unbracketed versions
    hint_pattern = re.compile(r"^(?:\[?\s*narration[_\s]+hint\s*\]?\s*:?)(.*)$", re.IGNORECASE)
    
    for line in text.splitlines():
        stripped = line.strip()
        match = hint_pattern.match(stripped)
        if match:
            # We found a hint line
            content_after = match.group(1).strip()
            if len(content_after) < 30: 
                # Likely just the hint value
                if content_after:
                   hint = content_after.lower()
                continue # Skip this line purely
            else:
                # Likely "NARRATION_HINT: The door opens..."
                # We want to keep "The door opens..."
                kept.append(content_after)
                hint = "narrate" 
        else:
            kept.append(line)
            
    # Join and then strip prefixes from the final result to clean up any "NARRATION:" tags that were part of the story body
    final_text = "\n".join(kept).strip()
    final_text = strip_prefixes(final_text)
    
    return (final_text, hint)

if CORS_ORIGINS == "*":
    allow_origins = ["*"]
else:
    allow_origins = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Local Model Chat Types ---
class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class CreateSessionRequest(BaseModel):
    system_prompt: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    messages: Optional[List[ChatMessage]] = None

class ImportSessionRequest(BaseModel):
    system_prompt: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    messages: List[ChatMessage]

class CreateSessionResponse(BaseModel):
    session_id: str

class SendMessageRequest(BaseModel):
    message: str
    fast: Optional[bool] = None


class ContinueRequest(BaseModel):
    fast: Optional[bool] = None

class SendMessageResponse(BaseModel):
    response: str
    session_id: str
    response_parts: Optional[List[str]] = None
    game_state: Optional[Dict[str, Any]] = None
    encounter: Optional[Dict[str, Any]] = None

class RulesSessionRequest(BaseModel):
    pc_id: str
    enemy_id: str
    story_session_id: Optional[str] = None

class RulesSessionResponse(BaseModel):
    session_id: str
    pc: Dict[str, Any]
    enemy: Dict[str, Any]
    round: int

class RulesStateResponse(BaseModel):
    pc: Dict[str, Any]
    enemy: Dict[str, Any]
    round: int
    log: List[str]
    story: List[str]

class AttackRequest(BaseModel):
    weapon_id: Optional[str] = None

class AttackResponse(BaseModel):
    attacker: str
    target: str
    attack_total: int
    attack_rolls: List[int]
    attack_bonus: int
    hit: bool
    damage_total: int
    damage_rolls: List[int]
    damage_bonus: int
    damage_type: str
    target_hp: int
    attacker_name: Optional[str] = None
    log: List[str]
    narration: Optional[str] = None

class SpellCastRequest(BaseModel):
    spell_id: str

class SpellCastResponse(BaseModel):
    spell_id: str
    name: str
    outcome: str
    dc: Optional[int] = None
    save: Optional[str] = None
    attack_total: Optional[int] = None
    attack_rolls: Optional[List[int]] = None
    attack_bonus: Optional[int] = None
    hit: Optional[bool] = None
    damage_total: int
    damage_rolls: List[int]
    damage_bonus: int
    damage_type: Optional[str] = None
    target_hp: int
    log: List[str]
    narration: Optional[str] = None

class SkillCheckRequest(BaseModel):
    ability: Optional[Literal["str", "dex", "con", "int", "wis", "cha"]] = None
    dc: int
    skill: Optional[str] = None
    save: Optional[Literal["str", "dex", "con", "int", "wis", "cha"]] = None

class SkillCheckResponse(BaseModel):
    total: int
    rolls: List[int]
    bonus: int
    success: bool
    narration: Optional[str] = None

class DCAssignRequest(BaseModel):
    ability: Optional[Literal["str", "dex", "con", "int", "wis", "cha"]] = None
    skill: Optional[str] = None
    save: Optional[Literal["str", "dex", "con", "int", "wis", "cha"]] = None
    context: Optional[str] = None

class DCAssignResponse(BaseModel):
    dc: int

class InitiativeResponse(BaseModel):
    total: int
    rolls: List[int]
    bonus: int

class WeaponInput(BaseModel):
    name: str
    attack_ability: Literal["str", "dex", "con", "int", "wis", "cha"]
    damage: str
    damage_type: str
    finesse: Optional[bool] = None

class CharacterCreateRequest(BaseModel):
    name: str
    klass: str
    level: int
    stats: Dict[str, int]
    armor_class: int
    max_hp: int
    weapons: List[WeaponInput]
    items: Optional[List[str]] = None
    conditions: Optional[List[str]] = None
    race: Optional[str] = None
    background: Optional[str] = None
    alignment: Optional[str] = None
    traits: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    spellcasting_ability: Optional[str] = None
    cantrips_known: Optional[List[str]] = None
    spellbook: Optional[List[str]] = None
    prepared_spells: Optional[List[str]] = None
    known_spells: Optional[List[str]] = None
    save_proficiencies: Optional[List[str]] = None
    skill_proficiencies: Optional[List[str]] = None

class CharacterCreateResponse(BaseModel):
    character_id: str

class EnemyCreateRequest(BaseModel):
    name: str
    armor_class: int
    max_hp: int
    attack_bonus: int
    damage: str
    damage_type: str

class EnemyCreateResponse(BaseModel):
    enemy_id: str

class IntroRequest(BaseModel):
    name: Optional[str] = None
    klass: Optional[str] = None

class IntroSessionRequest(BaseModel):
    name: Optional[str] = None
    klass: Optional[str] = None
    character: Optional[Dict[str, Any]] = None

class IntroResponse(BaseModel):
    intro: str

class AuthRequest(BaseModel):
    email: str

class AuthVerifyRequest(BaseModel):
    email: str
    code: str

class WalletNonceRequest(BaseModel):
    address: str

class WalletNonceResponse(BaseModel):
    address: str
    message: str

class WalletVerifyRequest(BaseModel):
    address: str
    signature: str
    typed_data: Optional[Dict[str, Any]] = None

class GoogleAuthRequest(BaseModel):
    id_token: str

class AuthResponse(BaseModel):
    token: str
    credits: int
    wallet: Optional[str] = None

class RedeemRequest(BaseModel):
    code: str

class RedeemResponse(BaseModel):
    credits: int

class AdminLoginCodeRequest(BaseModel):
    email: str

class AdminLoginCodeResponse(BaseModel):
    code: str

class AdminRedeemCodeRequest(BaseModel):
    credits: int

class AdminRedeemCodeResponse(BaseModel):
    code: str

class AdminCreditRequest(BaseModel):
    email: Optional[str] = None
    wallet: Optional[str] = None
    credits: int

class AdminCreditResponse(BaseModel):
    credits: int

class PaymentCreateRequest(BaseModel):
    credits: int

class PaymentCreateResponse(BaseModel):
    order_id: str
    address: str
    amount: str
    credits: int
    status: str

class PaymentStatusResponse(BaseModel):
    order_id: str
    status: str
    credits: int
    address: str
    amount: str
    tx_hash: Optional[str] = None
    confirmations: int = 0

class PlayPurchaseRequest(BaseModel):
    product_id: str
    transaction_id: Optional[str] = None
    purchase_token: Optional[str] = None

class PlayPurchaseResponse(BaseModel):
    credits: int
    product: str

sessions: Dict[str, Dict[str, Any]] = {}
rules_sessions: Dict[str, RulesSession] = {}
DATA_DIR = os.getenv("DATA_DIR", os.path.dirname(__file__))
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR, exist_ok=True)

SESSIONS_STORE_PATH = os.getenv("SESSIONS_STORE_PATH", os.path.join(DATA_DIR, "sessions_store.json"))
WORLD_STORE_PATH = os.getenv(
    "WORLD_STORE_PATH", os.path.join(DATA_DIR, "world_state_store.json")
)
RULES_STORE_PATH = os.getenv("RULES_STORE_PATH", os.path.join(DATA_DIR, "rules_store.json"))
CHARACTER_STORE_PATH = os.getenv(
    "CHARACTER_STORE_PATH", os.path.join(DATA_DIR, "characters_store.json")
)
BESTIARY_SRD_PATH = os.getenv(
    "BESTIARY_SRD_PATH", os.path.join(os.path.dirname(__file__), "bestiary_srd.json")
)
BESTIARY_CUSTOM_PATH = os.getenv(
    "BESTIARY_CUSTOM_PATH", os.path.join(DATA_DIR, "bestiary_custom.json")
)
SPELLS_SRD_PATH = os.getenv(
    "SPELLS_SRD_PATH", os.path.join(os.path.dirname(__file__), "spells_srd.json")
)
USERS_STORE_PATH = os.getenv(
    "USERS_STORE_PATH", os.path.join(DATA_DIR, "users_store.json")
)
LOGIN_CODES_PATH = os.getenv(
    "LOGIN_CODES_PATH", os.path.join(DATA_DIR, "login_codes.json")
)
REDEEM_CODES_PATH = os.getenv(
    "REDEEM_CODES_PATH", os.path.join(DATA_DIR, "redeem_codes.json")
)
WALLET_NONCES_PATH = os.getenv(
    "WALLET_NONCES_PATH", os.path.join(DATA_DIR, "wallet_nonces.json")
)
PAYMENTS_ORDERS_PATH = os.getenv(
    "PAYMENTS_ORDERS_PATH", os.path.join(DATA_DIR, "payments_orders.json")
)
PAYMENTS_STATE_PATH = os.getenv(
    "PAYMENTS_STATE_PATH", os.path.join(DATA_DIR, "payments_state.json")
)
custom_characters: Dict[str, Dict[str, Any]] = {}
custom_bestiary: Dict[str, Dict[str, Any]] = {}
bestiary_srd: Dict[str, Dict[str, Any]] = {}
spells_srd: Dict[str, Dict[str, Any]] = {}
users_store: Dict[str, Dict[str, Any]] = {}
login_codes: Dict[str, str] = {}
redeem_codes: Dict[str, Dict[str, Any]] = {}
wallet_nonces: Dict[str, Dict[str, Any]] = {}
payment_orders: Dict[str, Dict[str, Any]] = {}
payment_state: Dict[str, Any] = {}
payment_watcher_task: Optional[asyncio.Task] = None
world_enhancer_task: Optional[asyncio.Task] = None
lore_generator_task: Optional[asyncio.Task] = None
world_state_store: Dict[str, Dict[str, Any]] = {}
campaign_seed_locks: Dict[str, asyncio.Lock] = {}
intro_locks: Dict[str, asyncio.Lock] = {}
encounter_setup_locks: Dict[str, asyncio.Lock] = {}


def load_rules_sessions() -> None:
    if not os.path.exists(RULES_STORE_PATH):
        return
    try:
        with open(RULES_STORE_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        for session_id, payload in data.items():
            rules_sessions[session_id] = deserialize_rules_session(payload)
    except (OSError, ValueError):
        return


def persist_rules_sessions() -> None:
    data = {session_id: serialize_rules_session(session) for session_id, session in rules_sessions.items()}
    with open(RULES_STORE_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=True, indent=2)

def load_sessions() -> Dict[str, Dict[str, Any]]:
    payload = load_simple_store(SESSIONS_STORE_PATH)
    if isinstance(payload, dict):
        for session in payload.values():
            ensure_session_state(session)
        return payload
    return {}

def persist_sessions() -> None:
    save_simple_store(SESSIONS_STORE_PATH, sessions)

def load_world_state() -> Dict[str, Dict[str, Any]]:
    payload = load_simple_store(WORLD_STORE_PATH)
    if isinstance(payload, dict):
        return payload
    return {}

def persist_world_state() -> None:
    save_simple_store(WORLD_STORE_PATH, world_state_store)

def stamp_now() -> str:
    return datetime.utcnow().isoformat()

def load_json_store(path: str, key: str) -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        payload = data.get(key)
        if isinstance(payload, dict):
            return payload
    except (OSError, ValueError):
        return {}
    return {}

def save_json_store(path: str, key: str, payload: Dict[str, Dict[str, Any]]) -> None:
    data = {key: payload}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=True, indent=2)

def load_bestiary_srd() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(BESTIARY_SRD_PATH):
        return {}
    try:
        with open(BESTIARY_SRD_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        payload = data.get("monsters")
        if isinstance(payload, dict):
            return payload
    except (OSError, ValueError):
        return {}
    return {}

def load_spells_srd() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(SPELLS_SRD_PATH):
        return {}
    try:
        with open(SPELLS_SRD_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        payload = data.get("spells")
        if isinstance(payload, dict):
            return payload
    except (OSError, ValueError):
        return {}
    return {}

def get_spellcasting_ability(pc: Character) -> str:
    return CLASS_SPELLCASTING_ABILITY.get(pc.klass.strip().lower(), "wis")

def parse_damage_from_text(text: str) -> Dict[str, Optional[str]]:
    dice = None
    match = re.search(r"\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)", text)
    if match:
        dice = match.group(1).replace(" ", "")
    else:
        match = re.search(r"\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\b", text)
        if match:
            dice = match.group(1).replace(" ", "")
    damage_type = None
    type_match = re.search(r"\b([A-Za-z]+)\s+damage\b", text)
    if type_match:
        damage_type = type_match.group(1).lower()
    return {"damage": dice, "damage_type": damage_type}

def parse_save_ability(text: str) -> Optional[str]:
    match = re.search(
        r"\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\b",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    ability = match.group(1).lower()
    return {
        "strength": "str",
        "dexterity": "dex",
        "constitution": "con",
        "intelligence": "int",
        "wisdom": "wis",
        "charisma": "cha",
    }.get(ability)

def parse_spell_mechanics(spell: Dict[str, Any]) -> Dict[str, Any]:
    text = " ".join([spell.get("desc", ""), spell.get("higher_level", "")]).strip()
    attack = "spell attack" in text.lower()
    save = parse_save_ability(text)
    damage = parse_damage_from_text(text)
    half_on_save = bool(
        re.search(
            r"half as much damage|half the damage|half damage|half on a successful",
            text,
            re.IGNORECASE,
        )
    )
    return {
        "attack": attack,
        "save": save,
        "damage": damage.get("damage"),
        "damage_type": damage.get("damage_type"),
        "half_on_save": half_on_save,
    }

def parse_action_mechanics(text: str) -> Dict[str, Any]:
    attack_bonus = None
    attack_match = re.search(r"\+(\d+)\s*to hit", text)
    if attack_match:
        attack_bonus = int(attack_match.group(1))
    damage = parse_damage_from_text(text)
    save = parse_save_ability(text)
    dc = None
    dc_match = re.search(r"\bDC\s*(\d+)\b", text)
    if dc_match:
        dc = int(dc_match.group(1))
    half_on_save = bool(re.search(r"half as much damage", text, re.IGNORECASE))
    return {
        "attack_bonus": attack_bonus,
        "save": save,
        "dc": dc,
        "damage": damage.get("damage"),
        "damage_type": damage.get("damage_type"),
        "half_on_save": half_on_save,
    }

def get_save_bonus(character: Character, ability: str) -> int:
    ability_bonus = (character.stats.get(ability, 10) - 10) // 2
    proficiency = character.prof_bonus if ability in character.save_proficiencies else 0
    return ability_bonus + proficiency

def get_monster_save_bonus(monster: Monster, ability: str) -> int:
    if ability in monster.saves:
        return int(monster.saves[ability])
    stat = monster.stats.get(ability, 10)
    return (stat - 10) // 2

def normalize_spell_payload(spell_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_classes = payload.get("classes")
    classes: List[str] = []
    if isinstance(raw_classes, str):
        classes = [part.strip() for part in raw_classes.split(",") if part.strip()]
    elif isinstance(raw_classes, list):
        classes = [str(item).strip() for item in raw_classes if str(item).strip()]
    return {
        "id": spell_id,
        "name": payload.get("name"),
        "level": payload.get("level"),
        "school": payload.get("school"),
        "casting_time": payload.get("casting_time"),
        "range": payload.get("range"),
        "duration": payload.get("duration"),
        "concentration": payload.get("concentration"),
        "ritual": payload.get("ritual"),
        "components": payload.get("components"),
        "desc": payload.get("desc"),
        "higher_level": payload.get("higher_level"),
        "classes": classes,
    }

def normalize_spell_key(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())

def resolve_spell_id(spell_key: str) -> Optional[str]:
    needle = normalize_spell_key(spell_key)
    if not needle:
        return None
    for spell_id, payload in spells_srd.items():
        name = payload.get("name") or ""
        if normalize_spell_key(spell_id) == needle or normalize_spell_key(name) == needle:
            return spell_id
    return None

def pick_enemy_action(monster: Monster) -> Optional[Dict[str, Any]]:
    actions = [action for action in (monster.actions or []) if action.get("desc")]
    usable: List[Dict[str, Any]] = []
    for action in actions:
        name = (action.get("name") or "").lower()
        if "multiattack" in name:
            continue
        mechanics = parse_action_mechanics(action.get("desc", ""))
        if mechanics.get("attack_bonus") is not None or mechanics.get("save"):
            usable.append({"action": action, "mechanics": mechanics})
    if not usable:
        return None
    return random.choice(usable)

def extract_dc_from_text(text: str) -> Optional[int]:
    if not text:
        return None
    match = re.search(r"\b(5|10|15|20|25|30)\b", text)
    if not match:
        return None
    return int(match.group(1))

async def assign_dc_from_ai(label: str, context: str) -> int:
    if not context:
        return 15
    prompt = (
        "You are the GM. Choose a Difficulty Class (DC) for a D&D 5e check.\n"
        "Use only one of: 5, 10, 15, 20, 25, 30.\n"
        "Respond with only the number.\n"
        f"Check: {label}\n"
        f"Situation: {context}"
    )
    try:
        response = await ollama_generate(prompt, fast=True)
    except httpx.HTTPError:
        return 15
    dc = extract_dc_from_text(response)
    return dc or 15

def load_simple_store(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return data
    except (OSError, ValueError):
        return {}
    return {}

def save_simple_store(path: str, payload: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)

def normalize_email(email: str) -> str:
    return email.strip().lower()

def normalize_wallet(address: str) -> str:
    value = address.strip().lower()
    if not value.startswith("0x"):
        return ""
    if len(value) != 42:
        return ""
    return value

def build_wallet_message(address: str, nonce: str) -> str:
    return (
        "Side Quest login\n"
        f"Wallet: {address}\n"
        f"Nonce: {nonce}\n"
        "Only sign this message to login."
    )

def generate_code(prefix: str = "", length: int = 8) -> str:
    raw = uuid.uuid4().hex.upper()
    code = raw[:length]
    if prefix:
        return f"{prefix}-{code}"
    return code

def get_or_create_user(email: str) -> Dict[str, Any]:
    for user_id, payload in users_store.items():
        if payload.get("email") == email:
            if int(payload.get("credits", 0)) < 1000:
                payload["credits"] = 1000
                save_simple_store(USERS_STORE_PATH, users_store)
            return payload
    user_id = str(uuid.uuid4())
    users_store[user_id] = {
        "id": user_id,
        "email": email,
        "credits": STARTING_CREDITS,
        "token": None,
    }
    save_simple_store(USERS_STORE_PATH, users_store)
    return users_store[user_id]

def get_or_create_user_wallet(address: str) -> Dict[str, Any]:
    for payload in users_store.values():
        if payload.get("wallet") == address:
            if int(payload.get("credits", 0)) < 1000:
                payload["credits"] = 1000
                save_simple_store(USERS_STORE_PATH, users_store)
            return payload
    user_id = str(uuid.uuid4())
    users_store[user_id] = {
        "id": user_id,
        "email": None,
        "wallet": address,
        "credits": STARTING_CREDITS,
        "token": None,
    }
    save_simple_store(USERS_STORE_PATH, users_store)
    return users_store[user_id]

def get_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    for payload in users_store.values():
        if payload.get("token") == token:
            return payload
    return None

def require_admin(x_admin_key: Optional[str]) -> None:
    if ADMIN_KEY and x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin key required")

def normalize_address(value: str) -> str:
    return value.strip().lower()

def get_price_table() -> Dict[int, Decimal]:
    if PRICE_TABLE_JSON:
        try:
            parsed = json.loads(PRICE_TABLE_JSON)
            if isinstance(parsed, dict):
                table = {}
                for key, value in parsed.items():
                    table[int(key)] = Decimal(str(value))
                return table
        except (ValueError, TypeError):
            pass
    return {
        50: Decimal("1.00"),
        200: Decimal("4.00"),
        400: Decimal("8.00"),
        2000: Decimal("40.00"),
    }

def get_base_price_for_credits(credits: int) -> Decimal:
    table = get_price_table()
    if credits in table:
        return table[credits]
    return Decimal(str(PRICE_PER_CREDIT_USDT)) * Decimal(credits)

def format_usdt(amount: Decimal) -> str:
    quantized = amount.quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    return f"{quantized:.6f}"

def generate_unique_amount(base_amount: Decimal) -> Decimal:
    existing = {order.get("amount") for order in payment_orders.values() if order.get("status") in {"pending", "seen"}}
    for _ in range(25):
        suffix = Decimal(random.randint(1, 99)) * Decimal("0.000001")
        candidate = base_amount + suffix
        formatted = format_usdt(candidate)
        if formatted not in existing:
            return candidate
    return base_amount

async def polygon_rpc(method: str, params: List[Any]) -> Any:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(POLYGON_RPC_URL, json=payload)
        response.raise_for_status()
        data = response.json()
    if "error" in data:
        raise ValueError(data["error"])
    return data.get("result")

async def get_latest_block() -> int:
    result = await polygon_rpc("eth_blockNumber", [])
    return int(result, 16)

def build_transfer_topic() -> str:
    return "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

def build_address_topic(address: str) -> str:
    clean = normalize_address(address)
    if clean.startswith("0x"):
        clean = clean[2:]
    return "0x" + clean.rjust(64, "0")

def decode_topic_address(topic: str) -> str:
    if not topic.startswith("0x"):
        return ""
    return "0x" + topic[-40:].lower()

def decode_usdt_amount(data: str) -> Decimal:
    value = int(data, 16)
    return Decimal(value) / Decimal(1_000_000)

def get_pending_orders() -> List[Dict[str, Any]]:
    pending = []
    for order in payment_orders.values():
        if order.get("status") in {"pending", "seen"}:
            pending.append(order)
    return pending

def save_payments() -> None:
    save_simple_store(PAYMENTS_ORDERS_PATH, payment_orders)
    save_simple_store(PAYMENTS_STATE_PATH, payment_state)

async def fetch_transfer_logs(from_block: int, to_block: int) -> List[Dict[str, Any]]:
    if not PAYMENT_WALLET_ADDRESS:
        return []
    params = [
        {
            "fromBlock": hex(from_block),
            "toBlock": hex(to_block),
            "address": USDT_CONTRACT_ADDRESS,
            "topics": [
                build_transfer_topic(),
                None,
                build_address_topic(PAYMENT_WALLET_ADDRESS),
            ],
        }
    ]
    result = await polygon_rpc("eth_getLogs", params)
    if isinstance(result, list):
        return result
    return []

def match_order_for_amount(amount: str, block_number: int) -> Optional[Dict[str, Any]]:
    candidates = []
    for order in payment_orders.values():
        if order.get("status") != "pending":
            continue
        if order.get("amount") != amount:
            continue
        created_block = order.get("created_block")
        if created_block and block_number < created_block:
            continue
        candidates.append(order)
    if not candidates:
        return None
    candidates.sort(key=lambda item: item.get("created_at") or "")
    return candidates[0]

async def process_payment_logs() -> None:
    if not PAYMENT_WALLET_ADDRESS:
        return
    latest_block = await get_latest_block()
    last_block = int(payment_state.get("last_block", 0))
    if last_block <= 0:
        last_block = max(0, latest_block - 200)
    if last_block > latest_block:
        payment_state["last_block"] = latest_block
        return
    scan_start = last_block
    max_range = PAYMENT_MAX_BLOCK_RANGE
    while scan_start <= latest_block:
        scan_end = min(scan_start + max_range - 1, latest_block)
        try:
            logs = await fetch_transfer_logs(scan_start, scan_end)
        except Exception as exc:
            if "Block range is too large" in str(exc) and max_range > 1:
                max_range = max(1, max_range // 2)
                continue
            raise
        for log in logs:
            topics = log.get("topics", [])
            if len(topics) < 3:
                continue
            to_addr = decode_topic_address(topics[2])
            if normalize_address(to_addr) != normalize_address(PAYMENT_WALLET_ADDRESS):
                continue
            amount_dec = decode_usdt_amount(log.get("data", "0x0"))
            amount_str = format_usdt(amount_dec)
            block_number = int(log.get("blockNumber", "0x0"), 16)
            tx_hash = log.get("transactionHash")
            if not tx_hash:
                continue
            for order in payment_orders.values():
                if order.get("tx_hash") == tx_hash:
                    break
            else:
                order = match_order_for_amount(amount_str, block_number)
                if order:
                    order["status"] = "seen"
                    order["tx_hash"] = tx_hash
                    order["block_number"] = block_number
                    order["matched_at"] = datetime.utcnow().isoformat()
        payment_state["last_block"] = scan_end
        scan_start = scan_end + 1

    for order in get_pending_orders():
        if order.get("status") != "seen":
            continue
        block_number = order.get("block_number")
        if not block_number:
            continue
        confirmations = max(0, latest_block - int(block_number) + 1)
        order["confirmations"] = confirmations
        if confirmations >= PAYMENT_CONFIRMATIONS:
            user = users_store.get(order.get("user_id"))
            if user:
                user["credits"] = int(user.get("credits", 0)) + int(order.get("credits", 0))
                order["status"] = "credited"
                order["credited_at"] = datetime.utcnow().isoformat()
                logger.info(
                    "Payment credited order_id=%s amount=%s wallet=%s credits=%s tx=%s",
                    order.get("id"),
                    order.get("amount"),
                    order.get("wallet"),
                    order.get("credits"),
                    order.get("tx_hash"),
                )
                save_simple_store(USERS_STORE_PATH, users_store)
    save_payments()

async def payment_watcher_loop() -> None:
    while True:
        try:
            await process_payment_logs()
        except Exception as exc:
            logger.warning("Payment watcher error: %s", exc)
        await asyncio.sleep(PAYMENT_POLL_INTERVAL)
def monster_from_payload(payload: Dict[str, Any]) -> Monster:
    return Monster(
        name=payload["name"],
        armor_class=int(payload["armor_class"]),
        max_hp=int(payload["max_hp"]),
        hp=int(payload.get("hp", payload["max_hp"])),
        attack_bonus=int(payload["attack_bonus"]),
        damage=payload["damage"],
        damage_type=payload["damage_type"],
        size=payload.get("size"),
        type=payload.get("type"),
        alignment=payload.get("alignment"),
        speed=payload.get("speed"),
        senses=payload.get("senses"),
        languages=payload.get("languages"),
        cr=payload.get("cr"),
        stats=dict(payload.get("stats", {})),
        saves=dict(payload.get("saves", {})),
        traits=list(payload.get("traits", [])),
        actions=list(payload.get("actions", [])),
        legendary_actions=list(payload.get("legendary_actions", [])),
    )

def character_from_payload(payload: Dict[str, Any]) -> "Character":
    klass = payload["class"]
    save_profs = list(payload.get("save_proficiencies") or CLASS_SAVE_PROFICIENCIES.get(klass.lower(), []))
    skill_profs = list(payload.get("skill_proficiencies") or [])
    weapons = {}
    for idx, weapon in enumerate(payload.get("weapons", []), start=1):
        key = weapon.get("id") or f"weapon_{idx}"
        weapons[key] = Weapon(
            name=weapon["name"],
            attack_ability=weapon["attack_ability"],
            damage=weapon["damage"],
            damage_type=weapon["damage_type"],
            finesse=bool(weapon.get("finesse", False)),
        )
    return Character(
        name=payload["name"],
        klass=klass,
        level=int(payload["level"]),
        stats=dict(payload["stats"]),
        prof_bonus=int(payload["prof_bonus"]),
        armor_class=int(payload["armor_class"]),
        max_hp=int(payload["max_hp"]),
        hp=int(payload.get("hp", payload["max_hp"])),
        weapons=weapons,
        race=payload.get("race"),
        background=payload.get("background"),
        alignment=payload.get("alignment"),
        traits=list(payload.get("traits", [])),
        languages=list(payload.get("languages", [])),
        spellcasting_ability=payload.get("spellcasting_ability"),
        cantrips_known=list(payload.get("cantrips_known", [])),
        spellbook=list(payload.get("spellbook", [])),
        prepared_spells=list(payload.get("prepared_spells", [])),
        known_spells=list(payload.get("known_spells", [])),
        save_proficiencies=save_profs,
        skill_proficiencies=skill_profs,
        conditions=list(payload.get("conditions", [])),
        items=list(payload.get("items", [])),
    )

def get_monster_catalog() -> Dict[str, Monster]:
    catalog: Dict[str, Monster] = {}
    for key, monster in MONSTERS.items():
        catalog[key] = monster
    for key, payload in bestiary_srd.items():
        catalog[key] = monster_from_payload(payload)
    for key, payload in custom_bestiary.items():
        catalog[key] = monster_from_payload(payload)
    return catalog

def parse_challenge_rating(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    if "/" in text:
        parts = text.split("/")
        if len(parts) == 2:
            try:
                return float(parts[0]) / float(parts[1])
            except ValueError:
                return None
    try:
        return float(text)
    except ValueError:
        return None

def select_encounter_monster(level: int) -> Optional[Dict[str, Any]]:
    catalog = get_monster_catalog()
    entries: List[Tuple[str, Monster, Optional[float]]] = []
    for key, monster in catalog.items():
        cr_value = parse_challenge_rating(getattr(monster, "cr", None))
        entries.append((key, monster, cr_value))
    if not entries:
        return None
    min_cr = max(0.25, level - 1)
    max_cr = max(min_cr, level + 1)
    eligible = [entry for entry in entries if entry[2] is not None and min_cr <= entry[2] <= max_cr]
    if not eligible:
        eligible = entries
    key, monster, cr_value = random.choice(eligible)
    return {
        "id": key,
        "name": monster.name,
        "cr": cr_value,
        "type": monster.type,
    }

def schedule_next_encounter(world_state: Dict[str, Any], level: int) -> Dict[str, Any]:
    updated = dict(world_state)
    now = time.time()
    interval_minutes = random.randint(10, 14)
    updated["next_encounter_at"] = now + (interval_minutes * 60)
    updated["next_encounter"] = select_encounter_monster(level)
    updated["next_encounter_setup"] = ""
    updated["next_encounter_setup_used"] = False
    updated["next_encounter_setup_pending"] = False
    updated["next_encounter_setup_at"] = None
    updated["updated_at"] = stamp_now()
    return updated

def maybe_trigger_encounter(
    state: Dict[str, Any], world_state: Dict[str, Any]
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    updated = dict(world_state)
    if state.get("in_combat"):
        return updated, None
    now = time.time()
    next_at = updated.get("next_encounter_at")
    if not isinstance(next_at, (int, float)):
        next_at = None
    character = state.get("character") if isinstance(state.get("character"), dict) else {}
    try:
        level = int(character.get("level") or 1)
    except (TypeError, ValueError):
        level = 1
    if next_at is None or updated.get("next_encounter") is None:
        updated = schedule_next_encounter(updated, level)
        next_at = updated.get("next_encounter_at")
    if next_at is None or now < float(next_at):
        return updated, None
    encounter = updated.get("next_encounter")
    if not isinstance(encounter, dict):
        encounter = select_encounter_monster(level)
    updated["last_encounter_at"] = now
    updated = schedule_next_encounter(updated, level)
    updated["updated_at"] = stamp_now()
    return updated, encounter

def build_encounter_setup_messages(
    state: Dict[str, Any], world_state: Dict[str, Any], encounter: Dict[str, Any]
) -> List[Dict[str, str]]:
    character = state.get("character") if isinstance(state.get("character"), dict) else {}
    name = character.get("name") or "the adventurer"
    klass = character.get("class") or "hero"
    level = character.get("level") or 1
    world_summary = str(world_state.get("summary") or "").strip()
    campaign_world = str(world_state.get("campaign_world") or "").strip()
    facts = world_state.get("facts") if isinstance(world_state.get("facts"), list) else []
    fact_lines = "; ".join([str(item).strip() for item in facts[-6:] if str(item).strip()])
    encounter_name = encounter.get("name") or "a threat"
    encounter_type = encounter.get("type") or "creature"
    encounter_cr = encounter.get("cr")
    encounter_line = f"{encounter_name} ({encounter_type})"
    if encounter_cr is not None:
        encounter_line += f", CR {encounter_cr}"
    return [
        {
            "role": "system",
            "content": (
                "You are the campaign architect. Write 1-2 sentences that foreshadow "
                "a future encounter. Keep it subtle and atmospheric. Do NOT start combat, "
                "do NOT call it an encounter, and do NOT ask a direct question. Avoid D&D references."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Player: {name} the {klass} (level {level}).\n"
                f"World summary: {world_summary or 'None'}\n"
                f"Campaign world: {campaign_world or 'None'}\n"
                f"Recent facts: {fact_lines or 'None'}\n"
                f"Upcoming encounter: {encounter_line}\n"
                "Write the foreshadowing now."
            ),
        },
    ]

async def _build_encounter_setup(
    state: Dict[str, Any], world_state: Dict[str, Any], encounter: Dict[str, Any]
) -> str:
    messages = build_encounter_setup_messages(state, world_state, encounter)
    text = strip_thoughts(
        (await ollama_chat_with_model(
            messages,
            fast=True,
            model_name=HEAVY_MODEL_NAME,
            fallback_model=HEAVY_FALLBACK_MODEL,
        )).strip()
    )
    if not text:
        return ""
    text = strip_state_leaks(text, state, world_state)
    return text.strip()

def kickoff_encounter_setup(
    session_id: Optional[str], state: Dict[str, Any], world_state: Dict[str, Any]
) -> None:
    if not session_id:
        return
    if world_state.get("next_encounter_setup") or world_state.get("next_encounter_setup_pending"):
        return
    encounter = world_state.get("next_encounter")
    if not isinstance(encounter, dict):
        return
    updated = dict(world_state)
    updated["next_encounter_setup_pending"] = True
    updated["updated_at"] = stamp_now()
    world_state_store[session_id] = updated
    persist_world_state()
    state_snapshot = copy.deepcopy(state)

    async def _background_task() -> None:
        lock = encounter_setup_locks.setdefault(session_id, asyncio.Lock())
        async with lock:
            store_world = world_state_store.get(session_id)
            if not isinstance(store_world, dict):
                return
            if store_world.get("next_encounter_setup"):
                store_world["next_encounter_setup_pending"] = False
                world_state_store[session_id] = store_world
                persist_world_state()
                return
            encounter_payload = store_world.get("next_encounter")
            if not isinstance(encounter_payload, dict):
                store_world["next_encounter_setup_pending"] = False
                world_state_store[session_id] = store_world
                persist_world_state()
                return
            log_clerk_event(f"encounter_setup generating session_id={session_id}")
            try:
                setup = await asyncio.wait_for(
                    _build_encounter_setup(state_snapshot, store_world, encounter_payload),
                    timeout=ENCOUNTER_SETUP_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                log_clerk_event(f"encounter_setup timeout session_id={session_id}")
                setup = ""
            updated_world = dict(store_world)
            updated_world["next_encounter_setup_pending"] = False
            if setup:
                updated_world["next_encounter_setup"] = setup
                updated_world["next_encounter_setup_used"] = False
                updated_world["next_encounter_setup_at"] = stamp_now()
            updated_world["updated_at"] = stamp_now()
            world_state_store[session_id] = updated_world
            persist_world_state()
            if setup:
                log_clerk_event(f"encounter_setup ready session_id={session_id}")

    asyncio.create_task(_background_task())

def get_character_catalog() -> Dict[str, Character]:
    catalog: Dict[str, Character] = {}
    for key, pc in PREMADE_SHEETS.items():
        catalog[key] = pc
    for key, payload in custom_characters.items():
        catalog[key] = character_from_payload(payload)
    return catalog

# --- API Key Gate (optional) ---
async def verify_api_key(x_api_key: Optional[str] = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

async def require_auth(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        logger.warning("Auth failure: Missing or malformed authorization header")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        logger.warning("Auth failure: Empty token in authorization header")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")
    user = get_user_by_token(token)
    if not user:
        logger.warning(f"Auth failure: Invalid token provided (token ends with ...{token[-4:] if len(token) > 4 else token})")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token")
    return user

# --- Local Model Helpers ---
def get_session_or_404(session_id: str) -> Dict[str, Any]:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    ensure_session_state(session)
    ensure_world_state(session_id)
    return session

def default_game_state() -> Dict[str, Any]:
    return {
        "summary": "",
        "facts": [],
        "flags": {},
        "narration_hint": "narrate",
        "in_combat": False,
        "inventory": [],
        "loot_pending": [],
        "pending_encounter": None,
        "updated_at": stamp_now(),
    }

def default_world_state() -> Dict[str, Any]:
    return {
        "summary": "",
        "facts": [],
        "campaign": {},
        "campaign_world": "",
        "next_encounter_at": None,
        "next_encounter": None,
        "last_encounter_at": None,
        "next_encounter_setup": "",
        "next_encounter_setup_used": False,
        "next_encounter_setup_pending": False,
        "next_encounter_setup_at": None,
        "updated_at": stamp_now(),
    }

def ensure_world_state(session_id: str) -> Dict[str, Any]:
    existing = world_state_store.get(session_id)
    if not isinstance(existing, dict):
        existing = default_world_state()
        world_state_store[session_id] = existing
    if "facts" not in existing:
        existing["facts"] = []
    if "summary" not in existing:
        existing["summary"] = ""
    if "campaign" not in existing:
        existing["campaign"] = {}
    if "campaign_world" not in existing:
        existing["campaign_world"] = ""
    if "next_encounter_at" not in existing:
        existing["next_encounter_at"] = None
    if "next_encounter" not in existing:
        existing["next_encounter"] = None
    if "last_encounter_at" not in existing:
        existing["last_encounter_at"] = None
    if "next_encounter_setup" not in existing:
        existing["next_encounter_setup"] = ""
    if "next_encounter_setup_used" not in existing:
        existing["next_encounter_setup_used"] = False
    if "next_encounter_setup_pending" not in existing:
        existing["next_encounter_setup_pending"] = False
    if "next_encounter_setup_at" not in existing:
        existing["next_encounter_setup_at"] = None
    if "staged_lore" not in existing:
        existing["staged_lore"] = {}
    return existing

def apply_world_updates(world_state: Dict[str, Any], updates: List[str]) -> Dict[str, Any]:
    if not updates:
        return world_state
    updated = dict(world_state)
    facts = list(updated.get("facts") or [])
    for entry in updates:
        clean = str(entry).strip()
        if clean:
            facts.append(clean)
    updated["facts"] = facts[-50:]
    updated["updated_at"] = stamp_now()
    return updated

def ensure_session_state(session: Dict[str, Any]) -> None:
    if "game_state" not in session or not isinstance(session.get("game_state"), dict):
        session["game_state"] = default_game_state()
    if "narration_hint" not in session["game_state"]:
        session["game_state"]["narration_hint"] = "narrate"
    if "in_combat" not in session["game_state"]:
        session["game_state"]["in_combat"] = False
    if "inventory" not in session["game_state"]:
        session["game_state"]["inventory"] = []
    if "loot_pending" not in session["game_state"]:
        session["game_state"]["loot_pending"] = []
    if "pending_encounter" not in session["game_state"]:
        session["game_state"]["pending_encounter"] = None

def apply_character_to_state(
    state: Dict[str, Any], name: Optional[str], klass: Optional[str], character: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    updated = dict(state)
    character_payload = character or {}
    if not character_payload:
        character_payload = {}
        if name:
            character_payload["name"] = name
        if klass:
            character_payload["class"] = klass
    if character_payload:
        updated["character"] = character_payload
        label = character_payload.get("name") or name or "Adventurer"
        klass_value = character_payload.get("class") or klass or "Hero"
        updated["summary"] = f"Character created: {label} the {klass_value}."
        facts = list(updated.get("facts") or [])
        facts.append(f"{label} is a {klass_value}.")
        updated["facts"] = facts[-20:]
    updated["updated_at"] = stamp_now()
    return updated

def set_story_combat_flag(story_session_id: Optional[str], in_combat: bool) -> None:
    if not story_session_id:
        return
    session = sessions.get(story_session_id)
    if not session:
        return
    ensure_session_state(session)
    session["game_state"]["in_combat"] = bool(in_combat)
    session["game_state"]["updated_at"] = stamp_now()
    persist_sessions()

def sync_combat_state_from_rules(session: RulesSession) -> None:
    if not session.story_session_id:
        return
    active = session.pc.hp > 0 and session.enemy.hp > 0
    set_story_combat_flag(session.story_session_id, active)

def apply_character_to_world(
    world_state: Dict[str, Any], name: Optional[str], klass: Optional[str], character: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    updated = dict(world_state)
    character_payload = character or {}
    label = character_payload.get("name") or name or "Adventurer"
    klass_value = character_payload.get("class") or klass or "Hero"
    facts = list(updated.get("facts") or [])
    facts.append(f"{label} is a {klass_value}.")
    updated["facts"] = facts[-50:]
    updated["summary"] = f"Character in world: {label} the {klass_value}."
    updated["updated_at"] = stamp_now()
    return updated

def build_ollama_options(fast: bool) -> Dict[str, Any]:
    base = {
        "repeat_penalty": 1.15,
        "presence_penalty": 0.4,
        "frequency_penalty": 0.4,
        "top_p": 0.9,
        "seed": random.randint(1, 2_000_000_000),
    }
    if fast:
        return {
            **base,
            "num_predict": 256,
            "temperature": 0.6,
        }
    return {
        **base,
        "num_predict": 2048,
        "temperature": 0.75,
    }

def get_rules_session_or_404(session_id: str) -> RulesSession:
    session = rules_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rules session not found")
    return session


def build_rules_prompt(session: RulesSession, last_log: str) -> List[Dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are a strict fantasy narrator. "
                "Do not change results, add new mechanics, or add extra effects. "
                "Narrate only the outcome in 2-4 sentences."
            ),
        },
        {
            "role": "user",
            "content": (
                f"PC: {session.pc.name} HP {session.pc.hp}/{session.pc.max_hp}, AC {session.pc.armor_class}. "
                f"Enemy: {session.enemy.name} HP {session.enemy.hp}/{session.enemy.max_hp}, AC {session.enemy.armor_class}. "
                f"Event: {last_log}"
            ),
        },
    ]


async def narrate_rules_event(session: RulesSession) -> str:
    last_log = session.log[-1] if session.log else "The fight continues."
    response = await ollama_chat(build_rules_prompt(session, last_log), fast=False)
    return response.strip()


def build_retry_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return messages + [
        {
            "role": "system",
            "content": "Respond with at least one short sentence. Do not return empty.",
        }
    ]

def build_continue_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return messages + [
        {
            "role": "system",
            "content": "Continue the response with one complete paragraph.",
        }
    ]

def should_retry_with_fallback(response: httpx.Response, model_name: str) -> bool:
    if not FALLBACK_MODEL_NAME or model_name == FALLBACK_MODEL_NAME:
        return False
    status = response.status_code
    try:
        body = response.text.lower()
    except Exception:
        body = ""
    if status in (400, 404, 500, 502):
        if "model" in body or "not found" in body or status in (500, 502):
            return True
    return False

async def ollama_chat_with_model(
    messages: List[Dict[str, str]],
    fast: bool,
    model_name: str,
    fallback_model: Optional[str] = None,
) -> str:
    fallback = fallback_model or model_name
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
        payload = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": build_ollama_options(fast),
        }
        response = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        if should_retry_with_fallback(response, payload["model"]) and fallback != payload["model"]:
            logger.warning(
                "Ollama model '%s' failed; falling back to '%s'.",
                payload["model"],
                fallback,
            )
            payload["model"] = fallback
            response = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
    return data.get("message", {}).get("content", "")

async def ollama_chat(messages: List[Dict[str, str]], fast: bool) -> str:
    return await ollama_chat_with_model(
        messages, fast, MODEL_NAME, fallback_model=FALLBACK_MODEL_NAME
    )

async def ollama_generate(prompt: str, fast: bool) -> str:
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "options": build_ollama_options(fast),
        }
        response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        if should_retry_with_fallback(response, payload["model"]):
            logger.warning(
                "Ollama model '%s' failed; falling back to '%s'.",
                payload["model"],
                FALLBACK_MODEL_NAME,
            )
            payload["model"] = FALLBACK_MODEL_NAME
            response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()
    return data.get("response", "")

async def ollama_generate_basic(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
        }
        response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        if should_retry_with_fallback(response, payload["model"]):
            logger.warning(
                "Ollama model '%s' failed; falling back to '%s'.",
                payload["model"],
                FALLBACK_MODEL_NAME,
            )
            payload["model"] = FALLBACK_MODEL_NAME
            response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()
    return data.get("response", "")

def get_last_user_message(messages: List[Dict[str, str]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return message.get("content", "")
    return ""

def get_last_assistant_message(messages: List[Dict[str, str]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "assistant":
            return message.get("content", "")
    return ""


def is_error_message(message: Dict[str, str]) -> bool:
    if message.get("role") != "assistant":
        return False
    content = message.get("content", "").lower()
    error_keywords = [
        "failed",
        "error",
        "timeout",
        "timed out",
        "request failed",
        "still thinking",
        "check again",
    ]
    return any(keyword in content for keyword in error_keywords)


def get_last_turn_messages(
    messages: List[Dict[str, str]], limit: int = 6
) -> List[Dict[str, str]]:
    if limit <= 0:
        return []
    filtered = [
        msg
        for msg in messages
        if msg.get("role") in ("user", "assistant") and not is_error_message(msg)
    ]
    if not filtered:
        return []
    return filtered[-limit:]

def last_assistant_asked_question(messages: List[Dict[str, str]]) -> bool:
    last = get_last_assistant_message(messages)
    return "?" in last if last else False

def without_last_assistant(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    trimmed = messages[:]
    for idx in range(len(trimmed) - 1, -1, -1):
        if trimmed[idx].get("role") == "assistant":
            return trimmed[:idx] + trimmed[idx + 1 :]
    return trimmed

def build_avoid_repeat_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    last_assistant = get_last_assistant_message(messages)
    suffix = ""
    if last_assistant:
        suffix = f" Previous reply: \"{last_assistant}\""
    return messages + [
        {
            "role": "system",
            "content": "Do not repeat the previous reply. Provide a fresh continuation."
            + suffix,
        }
    ]

def strip_thoughts(text: str) -> str:
    # Remove entire thought blocks <think>...</think> including newlines
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    
    # Remove lingering markers if any
    markers = ["<think>", "</think>", "Thought:", "Reasoning:", "Analysis:"]
    cleaned = text
    for marker in markers:
        cleaned = cleaned.replace(marker, "")
        
    cleaned = re.sub(r"\bd&d\b", "the campaign", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bdungeons?\s*&\s*dragons?\b", "the campaign", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(?i)you said\s*:\s*\"?[^\n]+\"?", "", cleaned)
    cleaned = re.sub(r"(?im)^\s*you said[^\n]*\n?", "", cleaned)
    cleaned = re.sub(r"(?i)you said[^.!?]*[.!?]?", "", cleaned)
    
    # Compress multiple newlines which might create "separate bubble" effects
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    
    return cleaned.strip()

def strip_state_leaks(text: str, state: Dict[str, Any], world_state: Dict[str, Any]) -> str:
    if not text:
        return text
    def normalize_line(value: str) -> str:
        cleaned = value.strip().strip("\"'")
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned.lower().strip()

    facts: List[str] = []
    for source in (state.get("facts"), world_state.get("facts")):
        if isinstance(source, list):
            facts.extend([str(item) for item in source if str(item).strip()])
    summaries = []
    for summary in (state.get("summary"), world_state.get("summary")):
        if isinstance(summary, str) and summary.strip():
            summaries.append(summary.strip())
    candidates = facts + summaries
    fact_set = set()
    for entry in candidates:
        for part in re.split(r"[.!?]+", entry):
            normalized = normalize_line(part)
            if normalized:
                fact_set.add(normalized)

    kept: List[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        normalized = normalize_line(stripped)
        if normalized in fact_set:
            continue
        if re.match(r"^[a-z0-9\\s]+ is a [a-z0-9\\s]+\\.?$", normalized) and len(normalized.split()) <= 6:
            continue
        if re.match(r"^\"?.+\"? was cast by .+\\.?$", normalized):
            continue
        kept.append(line)
    return "\n".join(kept).strip()

def log_clerk_event(message: str) -> None:
    try:
        os.makedirs(os.path.dirname(CLERK_LOG_PATH), exist_ok=True)
        with open(CLERK_LOG_PATH, "a", encoding="ascii", errors="ignore") as handle:
            handle.write(f"[{stamp_now()}] {message}\n")
    except OSError:
        logger.info("Clerk: %s", message)

def extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    trimmed = text.strip()
    try:
        payload = json.loads(trimmed)
        if isinstance(payload, dict):
            return payload
    except ValueError:
        pass
    match = re.search(r"\{[\s\S]*\}", trimmed)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
        if isinstance(payload, dict):
            return payload
    except ValueError:
        return None
    return None

def build_clerk_messages(
    state: Dict[str, Any], world_state: Dict[str, Any], user_input: str
) -> List[Dict[str, str]]:
    safe_state = json.dumps(state, ensure_ascii=True)
    safe_world = json.dumps(world_state, ensure_ascii=True)
    return [
        {
            "role": "system",
            "content": (
                "You are the game clerk. Update the game state based on the player input. "
                "Do not narrate. Output only JSON with keys: should_narrate (boolean), "
                "state (object), story_input (string), player_reply (string), world_updates (array), "
                "world_summary (string), inventory_add (array), inventory_remove (array), "
                "action_type (string), new_locations (array of strings), new_npcs (array of strings), "
                "used_staged_lore (array of strings). "
                "story_input should be the player's message cleaned to only story actions. "
                "If should_narrate is false, player_reply should be a brief non-narrative ack. "
                "action_type should be 'equip' only for equipping items; otherwise use 'narrate'. "
                "world_updates should list new persistent facts (short sentences) to store. "
                "world_summary should be a concise 1-3 sentence rolling summary of the story so far. "
                "inventory_add should list newly discovered loot items to add to inventory. "
                "inventory_remove should list items that are consumed or removed. "
                "new_locations should list any new and significant locations mentioned in the story. "
                "used_staged_lore should list the names of any NPCs or locations from the 'staged_lore' that were used in the story. "
                "If a physical combat encounter begins, include 'encounter': {'name': 'Name of Enemy', 'cr': 'optional CR'} in the JSON. "
                "Make leveling part of your GM goals: aim for progression from level 1 to level 5 "
                "in about 2 hours of play (roughly ~5 encounters). When a milestone is reached, "
                "update state.character.level and add a world_update like 'Level up: <name> is now level X.'"
            ),
        },
        {
            "role": "user",
            "content": (
                "Current state JSON:\n"
                f"{safe_state}\n\n"
                "World state JSON:\n"
                f"{safe_world}\n\n"
                "Player message:\n"
                f"{user_input}\n\n"
                "Return the updated JSON now."
            ),
        },
    ]

def build_filter_messages(state: Dict[str, Any], story_text: str) -> List[Dict[str, str]]:
    safe_state = json.dumps(state, ensure_ascii=True)
    return [
        {
            "role": "system",
            "content": (
                "You are the story clerk. Remove meta, analysis, tool logs, and any "
                "lines like 'NARRATION_HINT:' from the text. Remove any references "
                "to D&D or d&d. Remove any 'You said' echoes. Return only clean story text."
            ),
        },
        {
            "role": "user",
            "content": (
                "Game state JSON:\n"
                f"{safe_state}\n\n"
                "Story text:\n"
                f"{story_text}\n\n"
                "Return only the clean story text."
            ),
        },
    ]

async def clerk_update_state(
    state: Dict[str, Any],
    world_state: Dict[str, Any],
    user_input: str,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    log_clerk_event("update_state started")
    messages = build_clerk_messages(state, world_state, user_input)
    raw = strip_thoughts((await ollama_chat_with_model(
        messages, fast=True, model_name=CLERK_MODEL_NAME, fallback_model=CLERK_FALLBACK_MODEL
    )).strip())
    payload = extract_json_object(raw) or {}
    next_state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    if not next_state:
        next_state = state
    next_state["updated_at"] = stamp_now()
    world_updates = payload.get("world_updates") if isinstance(payload.get("world_updates"), list) else []
    action_type = str(payload.get("action_type") or "narrate").strip().lower()
    world_summary = payload.get("world_summary")
    world_summary = world_summary.strip() if isinstance(world_summary, str) else ""
    inventory_add = payload.get("inventory_add") if isinstance(payload.get("inventory_add"), list) else []
    inventory_remove = payload.get("inventory_remove") if isinstance(payload.get("inventory_remove"), list) else []
    inventory_add = [str(item).strip() for item in inventory_add if str(item).strip()]
    inventory_remove = [str(item).strip() for item in inventory_remove if str(item).strip()]
    inventory = list(next_state.get("inventory") or [])
    for item in inventory_add:
        if item not in inventory:
            inventory.append(item)
    if inventory_remove:
        inventory = [item for item in inventory if item not in set(inventory_remove)]
    next_state["inventory"] = inventory
    next_state["loot_pending"] = inventory_add

    used_staged_lore = payload.get("used_staged_lore") if isinstance(payload.get("used_staged_lore"), list) else []
    if used_staged_lore:
        if "staged_lore" in world_state:
            if "npcs" in world_state["staged_lore"]:
                for npc_name in used_staged_lore:
                    for i, npc in enumerate(world_state["staged_lore"]["npcs"]):
                        if npc["name"] == npc_name:
                            if "npcs" not in world_state:
                                world_state["npcs"] = {}
                            world_state["npcs"][npc_name] = npc
                            del world_state["staged_lore"]["npcs"][i]
                            break
            if "locations" in world_state["staged_lore"]:
                for loc_name in used_staged_lore:
                    for i, loc in enumerate(world_state["staged_lore"]["locations"]):
                        if loc["name"] == loc_name:
                            if "locations" not in world_state:
                                world_state["locations"] = {}
                            world_state["locations"][loc_name] = loc
                            del world_state["staged_lore"]["locations"][i]
                            break

    new_locations = payload.get("new_locations") if isinstance(payload.get("new_locations"), list) else []
    if new_locations:
        if "locations" not in world_state:
            world_state["locations"] = {}
        for location_name in new_locations:
            if location_name not in world_state["locations"]:
                 # BLOCKING: Wait for bestiary/world generation so Narrator has context
                log_clerk_event(f"Blocking for world gen: {location_name}")
                details = await _build_location_details(location_name, world_state)
                if details:
                    if "locations" not in world_state:
                        world_state["locations"] = {}
                    world_state["locations"][location_name] = details
                    # Update local state too so current turn sees it
                    next_state["updated_at"] = stamp_now()
                    log_clerk_event(f"World gen complete: {location_name}")

    # SOCIAL COMBAT SYSTEM
    # Naive check: does input verify simple interaction with known NPC?
    # We can refine this by letting Clerk LLM identify the target, but for "hybrid" speed/robustness:
    social_result = None
    known_npcs = {}
    if "locations" in world_state:
        for loc_data in world_state["locations"].values():
             if isinstance(loc_data, dict):
                 for npc in loc_data.get("npcs", []):
                     known_npcs[npc["name"].lower()] = npc
    
    target_npc = None
    for name, npc_data in known_npcs.items():
        if name in user_input.lower():
             target_npc = npc_data
             break
    
    if target_npc:
        # Perform Reaction Roll
        # 2d6 + CHA Mod
        cha_score = state.get("character", {}).get("abilities", {}).get("cha", 10)
        roll = roll_dice(2, 6) + ability_mod(cha_score)
        
        # Compare to NPC Base Disposition
        base = target_npc.get("disposition_score", 7)
        
        # Simple Difficulty Class logic: 
        # Roll result < Base-2 => Degrading/Hostile
        # Roll result > Base+2 => Improving/Friendly
        # Else => Status Quo
        
        # Actually user wants Result to DETERMINE attitude:
        # 2-5: Hostile, 6-8: Neutral, 9+: Friendly.
        # Let's adjust by NPC base disposition (offset from 7).
        offset = base - 7
        final_score = roll + offset
        
        attitude = "Neutral"
        if final_score <= 5:
            attitude = "Hostile (Rude, dismissive, or aggressive)"
        elif final_score >= 9:
            attitude = "Friendly (Helpful, open, or warm)"
        
        social_result = f"Interaction with {target_npc['name']}. Reaction Roll: {final_score} ({roll} + {offset} offset). Result: {attitude}."
        next_state["social_result"] = social_result
    else:
        # Clear previous social result if no NPC interaction detected
        if "social_result" in next_state:
             del next_state["social_result"]

    updated_world, encounter = maybe_trigger_encounter(next_state, world_state)
    
    # Allow Clerk to force an encounter
    clerk_encounter = payload.get("encounter")
    if isinstance(clerk_encounter, dict) and clerk_encounter.get("name"):
         encounter = clerk_encounter

    result = {
        "should_narrate": bool(payload.get("should_narrate", True)),
        "state": next_state,
        "story_input": payload.get("story_input") or user_input,
        "player_reply": payload.get("player_reply") or "Noted.",
        "world_updates": [str(item).strip() for item in world_updates if str(item).strip()],
        "world_summary": world_summary,
        "action_type": action_type,
        "world_state": updated_world,
        "encounter": encounter, 
    }
    if result["action_type"] != "equip":
        result["should_narrate"] = True
    if encounter:
        encounter_name = encounter.get("name") or "a threat"
        cr_value = encounter.get("cr")
        encounter_line = f"An encounter begins: {encounter_name} appears."
        if cr_value is not None:
             encounter_line = f"An encounter begins: {encounter_name} (CR {cr_value}) appears."
        # Append encounter to story input so Narrator sees it
        story_input = result["story_input"]
        if encounter_line not in story_input:
             result["story_input"] = f"{story_input} {encounter_line}".strip()
        result["should_narrate"] = True
        result["action_type"] = "narrate"
        next_state["pending_encounter"] = encounter
        
    if not encounter:
        setup = str(updated_world.get("next_encounter_setup") or "").strip()
        if setup and not updated_world.get("next_encounter_setup_used"):
            story_input = f"{result['story_input']} {setup}"
            result["story_input"] = story_input.strip()
            updated_world["next_encounter_setup_used"] = True
            updated_world["updated_at"] = stamp_now()
    if encounter:
        encounter_name = encounter.get("name") or "a threat"
        cr_value = encounter.get("cr")
        encounter_line = f"An encounter begins: {encounter_name} appears."
        if cr_value is not None:
            encounter_line = f"An encounter begins: {encounter_name} (CR {cr_value}) appears."
        story_input = f"{result['story_input']} {encounter_line}"
        result["story_input"] = story_input.strip()
        result["should_narrate"] = True
        result["action_type"] = "narrate"
        next_state["pending_encounter"] = encounter
    if not encounter:
        kickoff_encounter_setup(session_id, next_state, updated_world)
    summary = str(result["state"].get("summary", "")).strip()
    summary = summary[:160] + ("..." if len(summary) > 160 else "")
    cleaned_input = str(result["story_input"]).strip()
    cleaned_input = cleaned_input[:200] + ("..." if len(cleaned_input) > 200 else "")
    log_clerk_event(
        f"completed should_narrate={result['should_narrate']} "
        f"action_type={result['action_type']} world_updates={len(result['world_updates'])} "
        f"story_input=\"{cleaned_input}\" state_summary=\"{summary}\""
    )
    return result

async def clerk_filter_story(
    state: Dict[str, Any], world_state: Dict[str, Any], story_text: str
) -> str:
    messages = build_filter_messages(state, story_text)
    cleaned = strip_thoughts((await ollama_chat_with_model(
        messages, fast=True, model_name=CLERK_MODEL_NAME, fallback_model=CLERK_FALLBACK_MODEL
    )).strip())
    if not cleaned:
        return story_text
    cleaned, _ = split_narration_hint(cleaned)
    if cleaned and not ends_with_sentence(cleaned):
        continuation_prompt = [
            {"role": "system", "content": build_story_system_prompt(state, world_state)},
            {"role": "user", "content": cleaned},
        ]
        continuation = await generate_min_response(
            build_continue_messages(continuation_prompt),
            True,
            12,
            model_name=CLERK_MODEL_NAME,
            fallback_model=CLERK_FALLBACK_MODEL,
        )
        if continuation:
            cleaned = (cleaned + " " + continuation).strip()
    return cleaned

async def ensure_campaign_brief(
    state: Dict[str, Any],
    world_state: Dict[str, Any],
    name: str,
    klass: str,
    lock_key: Optional[str] = None,
    store_key: Optional[str] = None,
) -> Dict[str, Any]:
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict) and str(campaign.get("summary") or "").strip():
        return world_state
    if lock_key:
        lock = campaign_seed_locks.setdefault(lock_key, asyncio.Lock())
        async with lock:
            tag = f" session_id={lock_key}"
            if store_key:
                store_world = world_state_store.get(store_key)
                if isinstance(store_world, dict):
                    world_state = store_world
            campaign = world_state.get("campaign")
            if isinstance(campaign, dict) and str(campaign.get("summary") or "").strip():
                return world_state
            world_seed = str(world_state.get("campaign_world") or "").strip()
            if not world_seed:
                log_clerk_event("campaign_world generating" + tag)
                try:
                    world_seed = await asyncio.wait_for(
                        _build_campaign_world(state),
                        timeout=20,
                    )
                except asyncio.TimeoutError:
                    log_clerk_event("campaign_world timeout fallback" + tag)
                    world_seed = DEFAULT_CAMPAIGN_WORLD
                updated = dict(world_state)
                updated["campaign_world"] = world_seed
                updated["updated_at"] = stamp_now()
                world_state = updated
                log_clerk_event("campaign_world ready" + tag)
                if store_key:
                    world_state_store[store_key] = updated
                    persist_world_state()
            log_clerk_event("campaign_seed generating" + tag)
            try:
                brief = await asyncio.wait_for(
                    _build_campaign_brief_from_world(world_seed, name, klass),
                    timeout=30,
                )
            except asyncio.TimeoutError:
                log_clerk_event("campaign_seed timeout fallback" + tag)
                brief = DEFAULT_CAMPAIGN_BRIEF
            updated = dict(world_state)
            updated["campaign"] = {"summary": brief, "created_at": stamp_now()}
            updated["updated_at"] = stamp_now()
            log_clerk_event("campaign_seed ready" + tag)
            if store_key:
                world_state_store[store_key] = updated
                persist_world_state()
            return updated
    world_seed = str(world_state.get("campaign_world") or "").strip()
    if not world_seed:
        log_clerk_event("campaign_world generating")
        try:
            world_seed = await asyncio.wait_for(
                _build_campaign_world(state),
                timeout=20,
            )
        except asyncio.TimeoutError:
            log_clerk_event("campaign_world timeout fallback")
            world_seed = DEFAULT_CAMPAIGN_WORLD
        updated = dict(world_state)
        updated["campaign_world"] = world_seed
        updated["updated_at"] = stamp_now()
        world_state = updated
        log_clerk_event("campaign_world ready")
        if store_key:
            world_state_store[store_key] = updated
            persist_world_state()
    log_clerk_event("campaign_seed generating")
    try:
        brief = await asyncio.wait_for(
            _build_campaign_brief_from_world(world_seed, name, klass),
            timeout=30,
        )
    except asyncio.TimeoutError:
        log_clerk_event("campaign_seed timeout fallback")
        brief = DEFAULT_CAMPAIGN_BRIEF
    updated = dict(world_state)
    updated["campaign"] = {"summary": brief, "created_at": stamp_now()}
    updated["updated_at"] = stamp_now()
    log_clerk_event("campaign_seed ready")
    return updated

async def _build_campaign_world(state: Dict[str, Any]) -> str:
    messages = [
        {
            "role": "system",
            "content": (
                "You are a game world architect for a dark fantasy dungeon crawl. "
                "Write 2 short sentences describing: setting, factions, and the current crisis. "
                "Keep it grounded and gameable. "
                "Mature themes (violence, horror, moral ambiguity) are allowed, "
                "but avoid explicit sexual content."
            ),
        },
        {"role": "user", "content": "Create a compact world state."},
    ]
    try:
        text = strip_thoughts(
            (
                await asyncio.wait_for(
                    ollama_chat_with_model(
                        messages,
                        fast=True,
                        model_name=HEAVY_MODEL_NAME,
                        fallback_model=HEAVY_FALLBACK_MODEL,
                    ),
                    timeout=25,
                )
            ).strip()
        )
    except asyncio.TimeoutError:
        log_clerk_event("campaign_world timeout fallback")
        return DEFAULT_CAMPAIGN_WORLD
    return text or DEFAULT_CAMPAIGN_WORLD

async def _build_campaign_brief_from_world(
    world_seed: str,
    name: str,
    klass: str,
) -> str:
    identity = ""
    if name and klass:
        identity = f"The hero is {name}, a {klass}."
    elif name:
        identity = f"The hero is {name}."
    elif klass:
        identity = f"The hero is a {klass}."
    messages = [
        {
            "role": "system",
            "content": (
                "You are a campaign designer for a dark fantasy dungeon crawl. "
                "Write a compact campaign brief in 2-3 sentences. "
                "Include: setting, central threat, and an immediate opening problem. "
                "Mature themes are allowed "
                "(violence, horror, intimacy, moral ambiguity). "
                "Keep it punchy and gameable."
            ),
        },
        {
            "role": "user",
            "content": (
                "Use this world state and craft a campaign brief:\n"
                + world_seed
                + "\n"
                + identity
            ).strip(),
        },
    ]
    brief = strip_thoughts(
        (
            await ollama_chat_with_model(
                messages,
                fast=True,
                model_name=HEAVY_MODEL_NAME,
                fallback_model=HEAVY_FALLBACK_MODEL,
            )
        ).strip()
    )
    if count_words(brief) < 18:
        retry = strip_thoughts(
            (
                await ollama_chat_with_model(
                    build_retry_messages(messages),
                    fast=True,
                    model_name=HEAVY_MODEL_NAME,
                    fallback_model=HEAVY_FALLBACK_MODEL,
                )
            ).strip()
        )
        if retry:
            brief = retry
    brief = strip_thoughts(brief).strip()
    brief, _ = split_narration_hint(brief)
    if not brief:
        brief = DEFAULT_CAMPAIGN_BRIEF
    return brief


async def _build_world_enhancement(world_state: Dict[str, Any]) -> str:
    world_summary = str(world_state.get("summary") or "").strip()
    campaign_summary = ""
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict):
        campaign_summary = str(campaign.get("summary") or "").strip()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a master storyteller and world-builder. The current world state is becoming stale. "
                "Your task is to introduce an exciting and unexpected event to make the world more dynamic and engaging."
            ),
        },
        {
            "role": "user",
            "content": (
                "Current campaign brief:\n"
                f"{campaign_summary or 'None'}\n\n"
                "Current world summary:\n"
                f"{world_summary or 'None'}\n\n"
                "Instructions:\n"
                "- Generate a short (1-3 sentences) description of an exciting event, a new character, a sudden danger, or a surprising discovery.\n"
                "- The event should be a natural but unexpected development in the current world.\n"
                "- Do not resolve the event. Your goal is to introduce a new element for the narrator to use.\n"
                "- Output only the description of the event.\n\n"
                "New Event:"
            ),
        },
    ]
    try:
        text = strip_thoughts(
            (
                await asyncio.wait_for(
                    ollama_chat_with_model(
                        messages,
                        fast=True,
                        model_name=HEAVY_MODEL_NAME,
                        fallback_model=HEAVY_FALLBACK_MODEL,
                    ),
                    timeout=45,
                )
            ).strip()
        )
    except asyncio.TimeoutError:
        log_clerk_event("world_enhancement timeout")
        return ""
    return text


async def _generate_random_npc_name() -> str:
    prompt = "Generate a random, interesting name for a fantasy character."
    try:
        name = await ollama_generate(prompt, fast=True)
        return name.strip()
    except httpx.HTTPError:
        return "a mysterious stranger"

async def _generate_random_location_name() -> str:
    prompt = "Generate a random, evocative name for a fantasy location."
    try:
        name = await ollama_generate(prompt, fast=True)
        return name.strip()
    except httpx.HTTPError:
        return "a hidden place"

async def lore_generator_loop() -> None:
    while True:
        await asyncio.sleep(600)  # Generate lore every 10 minutes
        log_clerk_event("lore_generator running")
        for session_id in list(sessions.keys()):
            try:
                session = sessions.get(session_id)
                if not session:
                    continue

                # Check if session is active
                last_user_at_str = session.get("last_user_at")
                if last_user_at_str:
                    last_user_at = datetime.fromisoformat(last_user_at_str)
                    if (datetime.utcnow() - last_user_at).total_seconds() > 1800:  # 30 minutes
                        continue

                world_state = ensure_world_state(session_id)
                
                # Randomly decide to generate a new NPC or Location
                if random.random() < 0.5:
                    # Generate NPC
                    npc_name = await _generate_random_npc_name()
                    new_npc = await _build_npc_details(npc_name, world_state)
                    if new_npc:
                        if "staged_lore" not in world_state:
                            world_state["staged_lore"] = {}
                        if "npcs" not in world_state["staged_lore"]:
                            world_state["staged_lore"]["npcs"] = []
                        world_state["staged_lore"]["npcs"].append({"name": npc_name, "description": new_npc})
                        world_state_store[session_id] = world_state
                        persist_world_state()
                        log_clerk_event(f"lore_generator added NPC to session {session_id}")
                else:
                    # Generate Location
                    location_name = await _generate_random_location_name()
                    new_location = await _build_location_details(location_name, world_state)
                    if new_location:
                        if "staged_lore" not in world_state:
                            world_state["staged_lore"] = {}
                        if "locations" not in world_state["staged_lore"]:
                            world_state["staged_lore"]["locations"] = []
                        world_state["staged_lore"]["locations"].append({"name": location_name, "description": new_location})
                        world_state_store[session_id] = world_state
                        persist_world_state()
                        log_clerk_event(f"lore_generator added location to session {session_id}")

            except Exception as exc:
                logger.warning(f"Lore generator error for session {session_id}: {exc}")


async def lore_generator_loop() -> None:
    while True:
        await asyncio.sleep(600)  # Generate lore every 10 minutes
        log_clerk_event("lore_generator running")
        for session_id in list(sessions.keys()):
            try:
                session = sessions.get(session_id)
                if not session:
                    continue

                # Check if session is active
                last_user_at_str = session.get("last_user_at")
                if last_user_at_str:
                    last_user_at = datetime.fromisoformat(last_user_at_str)
                    if (datetime.utcnow() - last_user_at).total_seconds() > 1800:  # 30 minutes
                        continue

                world_state = ensure_world_state(session_id)
                
                # Randomly decide to generate a new NPC or Location
                if random.random() < 0.5:
                    # Generate NPC
                    npc_name = "a mysterious stranger" # This can be made more dynamic
                    new_npc = await _build_npc_details(npc_name, world_state)
                    if new_npc:
                        if "staged_lore" not in world_state:
                            world_state["staged_lore"] = {}
                        if "npcs" not in world_state["staged_lore"]:
                            world_state["staged_lore"]["npcs"] = []
                        world_state["staged_lore"]["npcs"].append({"name": npc_name, "description": new_npc})
                        world_state_store[session_id] = world_state
                        persist_world_state()
                        log_clerk_event(f"lore_generator added NPC to session {session_id}")
                else:
                    # Generate Location
                    location_name = "a hidden place" # This can be made more dynamic
                    new_location = await _build_location_details(location_name, world_state)
                    if new_location:
                        if "staged_lore" not in world_state:
                            world_state["staged_lore"] = {}
                        if "locations" not in world_state["staged_lore"]:
                            world_state["staged_lore"]["locations"] = []
                        world_state["staged_lore"]["locations"].append({"name": location_name, "description": new_location})
                        world_state_store[session_id] = world_state
                        persist_world_state()
                        log_clerk_event(f"lore_generator added location to session {session_id}")

            except Exception as exc:
                logger.warning(f"Lore generator error for session {session_id}: {exc}")


async def world_enhancer_loop() -> None:
    while True:
        await asyncio.sleep(300)
        log_clerk_event("world_enhancer running")
        for session_id in list(sessions.keys()):
            try:
                session = sessions.get(session_id)
                if not session:
                    continue

                # Check if session is active
                last_user_at_str = session.get("last_user_at")
                if last_user_at_str:
                    last_user_at = datetime.fromisoformat(last_user_at_str)
                    if (datetime.utcnow() - last_user_at).total_seconds() > 1800:  # 30 minutes
                        continue

                world_state = ensure_world_state(session_id)
                enhancement = await _build_world_enhancement(world_state)
                if enhancement:
                    session["messages"].append({"role": "assistant", "content": enhancement})
                    session["last_assistant_at"] = stamp_now()
                    session["last_assistant_message"] = enhancement
                    persist_sessions()
                    log_clerk_event(f"world_enhancement added event to session {session_id}")
            except Exception as exc:
                logger.warning(f"World enhancer error for session {session_id}: {exc}")



def _generate_scene_context() -> Dict[str, str]:
    days = ["Moonday", "Tovday", "Wensday", "Thorsday", "Freeday", "Starday", "Sunday"]
    times = ["Dawn", "Morning", "High Noon", "Afternoon", "Dusk", "Evening", "Midnight", "Witching Hour"]
    crowds = ["Empty", "Sparse", "Quiet", "Moderate", "Busy", "Packed", "Overflowing"]
    atmospheres = ["Tense", "Jovial", "Somber", "Chaotic", "Peaceful", "Eerie", "Festive", "Gloom"]
    
    return {
        "day": random.choice(days),
        "time": random.choice(times),
        "crowd": random.choice(crowds),
        "atmosphere": random.choice(atmospheres),
    }

async def _build_npc_roster(location_name: str, context: Dict[str, str], world_state: Dict[str, Any]) -> List[Dict[str, Any]]:
    campaign_summary = ""
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict):
        campaign_summary = str(campaign.get("summary") or "").strip()
        
    prompt = (
        f"Create a roster of 3-5 distinct NPCs for a setting: {location_name}.\n"
        f"Context: It is {context['time']} on {context['day']}. The place is {context['crowd']} and {context['atmosphere']}.\n"
        f"Campaign Context: {campaign_summary}\n"
        "For EACH NPC, provide:\n"
        "1. Name and Role (e.g., Bartender, Patron, Spy)\n"
        "2. Appearance and Mannerism (1 sentence)\n"
        "3. Motivation (Why are they here right now?)\n"
        "4. Secret (Something they won't reveal without a bribe or high trust)\n"
        "5. Relationships (One connection to another NPC in this list, and thoughts on the Player if applicable)\n"
        "6. Disposition Score (A number from 2 to 12. 2=Hostile, 7=Neutral, 12=Friendly)\n"
        "Output in JSON format: [{ 'name': '...', 'role': '...', 'description': '...', 'motivation': '...', 'secret': '...', 'relationships': '...', 'disposition_score': 7 }, ...]"
    )
    
    messages = [
        {"role": "system", "content": "You are a master NPC generator. Return ONLY valid JSON."},
        {"role": "user", "content": prompt}
    ]
    
    try:
        raw = await asyncio.wait_for(
            ollama_chat_with_model(
                messages, 
                fast=False, 
                model_name=HEAVY_MODEL_NAME, 
                fallback_model=HEAVY_FALLBACK_MODEL
            ), 
            timeout=90
        )
        # Attempt to parse JSON from the response
        json_match = re.search(r"\[.*\]", raw, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
        return []
    except (asyncio.TimeoutError, json.JSONDecodeError, Exception) as e:
        logger.warning(f"NPC generation failed for {location_name}: {e}")
        return []

async def _build_location_details(location_name: str, world_state: Dict[str, Any]) -> Dict[str, Any]:
    world_summary = str(world_state.get("summary") or "").strip()
    campaign_summary = ""
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict):
        campaign_summary = str(campaign.get("summary") or "").strip()

    context = _generate_scene_context()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a master storyteller and world-builder. "
                "Your task is to create a rich and detailed description for a new location."
            ),
        },
        {
            "role": "user",
            "content": (
                "Current campaign brief:\n"
                f"{campaign_summary or 'None'}\n\n"
                "Current world summary:\n"
                f"{world_summary or 'None'}\n\n"
                f"Location Name: {location_name}\n"
                f"Scene Context: {context['time']} on {context['day']}. Crowd: {context['crowd']}. Atmosphere: {context['atmosphere']}.\n\n"
                "Instructions:\n"
                "- Generate a 2 paragraph description of the location, incorporating the specific time, crowd, and atmosphere.\n"
                "- Include sensory details: smells, sounds, lighting.\n"
                "- Mention specific details that hint at the generated context (e.g. if crowded, noise; if empty, silence).\n"
                "- Include a secret or hidden detail about the location itself.\n"
                "- Output only the description text.\n"
            ),
        },
    ]
    try:
        description = strip_thoughts(
            (
                await asyncio.wait_for(
                    ollama_chat_with_model(
                        messages,
                        fast=False,  # Use the better model for this creative task
                        model_name=HEAVY_MODEL_NAME,
                        fallback_model=HEAVY_FALLBACK_MODEL,
                    ),
                    timeout=60,
                )
            ).strip()
        )
    except asyncio.TimeoutError:
        log_clerk_event(f"location_details timeout for {location_name}")
        return {}
        
    # Generate NPCs
    npcs = await _build_npc_roster(location_name, context, world_state)
    
    return {
        "description": description,
        "context": context,
        "npcs": npcs,
        "created_at": stamp_now()
    }



async def _build_npc_details(npc_name: str, world_state: Dict[str, Any]) -> str:
    world_summary = str(world_state.get("summary") or "").strip()
    campaign_summary = ""
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict):
        campaign_summary = str(campaign.get("summary") or "").strip()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a master storyteller and world-builder. "
                "Your task is to create a rich and detailed description for a new non-player character (NPC)."
            ),
        },
        {
            "role": "user",
            "content": (
                "Current campaign brief:\n"
                f"{campaign_summary or 'None'}\n\n"
                "Current world summary:\n"
                f"{world_summary or 'None'}\n\n"
                f"NPC Name: {npc_name}\n\n"
                "Instructions:\n"
                "- Generate a 3-5 sentence description of the NPC's backstory, motivations, and a secret.\n"
                "- Describe the NPC's appearance and mannerisms.\n"
                "- Provide a memorable quote from the NPC.\n"
                "- Describe the NPC's relationship to the factions in the world.\n"
                "- The description should be evocative and provide hooks for future adventures and roleplaying.\n"
                "- Output only the description of the NPC.\n"
            ),
        },
    ]
    try:
        text = strip_thoughts(
            (
                await asyncio.wait_for(
                    ollama_chat_with_model(
                        messages,
                        fast=False,  # Use the better model for this creative task
                        model_name=HEAVY_MODEL_NAME,
                        fallback_model=HEAVY_FALLBACK_MODEL,
                    ),
                    timeout=60,
                )
            ).strip()
        )
    except asyncio.TimeoutError:
        log_clerk_event(f"npc_details timeout for {npc_name}")
        return ""
    return text

async def generate_intro_story(
    state: Dict[str, Any], world_state: Dict[str, Any], name: str, klass: str
) -> str:
    identity = ""
    if name and klass:
        identity = f"The hero is {name}, a {klass}."
    elif name:
        identity = f"The hero is {name}."
    elif klass:
        identity = f"The hero is a {klass}."
    campaign_summary = ""
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict):
        campaign_summary = str(campaign.get("summary") or "").strip()
    
    settings = [
        "a sunless citadel", "a flooded mine", "a ruined watchtower", "a cursed forest",
        "a mountain pass", "an ancient crypt", "a sewers network", "a frozen wasteland",
        "a crumbling temple", "a fog-shrouded swamp"
    ]
    setting = random.choice(settings)
    
    prompt = (
        f"Write an opening scene for a dungeon crawl set in {setting} (exactly 2 sentences). "
        "Make it vivid and specific with a clear hook, then end with a direct question. "
        "Include a hint of danger and wonder. "
        + identity
        + (" Campaign brief: " + campaign_summary if campaign_summary else "")
        + " Avoid cliche tavern starts."
    ).strip()
    messages = [
        {"role": "system", "content": build_story_system_prompt(state, world_state)},
        {"role": "user", "content": prompt},
    ]
    text = strip_thoughts(
        (
            await ollama_chat_with_model(
                messages,
                fast=True,
                model_name=CLERK_MODEL_NAME,
                fallback_model=CLERK_FALLBACK_MODEL,
            )
        ).strip()
    )
    if count_words(text) < 12:
        retry = strip_thoughts(
            (
                await ollama_chat_with_model(
                    build_retry_messages(messages),
                    fast=True,
                    model_name=CLERK_MODEL_NAME,
                    fallback_model=CLERK_FALLBACK_MODEL,
                )
            ).strip()
        )
        if retry:
            text = retry
    text, hint = split_narration_hint(text)
    if hint:
        state["narration_hint"] = hint
    if text:
        return strip_state_leaks(text, state, world_state)
    retry = await generate_min_response(messages, fast=True, min_words=12)
    retry, hint = split_narration_hint(retry)
    if hint:
        state["narration_hint"] = hint
    if retry:
        return strip_state_leaks(retry, state, world_state)
    log_clerk_event("intro_story empty fallback")
    return pick_intro_fallback()

async def generate_clerk_intro_fast(
    state: Dict[str, Any], world_state: Dict[str, Any], name: str, klass: str
) -> str:
    identity = ""
    if name and klass:
        identity = f"The hero is {name}, a {klass}."
    elif name:
        identity = f"The hero is {name}."
    elif klass:
        identity = f"The hero is a {klass}."
    campaign_summary = ""
    campaign = world_state.get("campaign")
    if isinstance(campaign, dict):
        campaign_summary = str(campaign.get("summary") or "").strip()
    prompt = (
        "Write a fast opening scene (exactly 2 sentences). "
        "Make it punchy and end with a direct question. "
        + identity
        + (" Campaign brief: " + campaign_summary if campaign_summary else "")
        + " Avoid tavern starts."
    ).strip()
    messages = [
        {"role": "system", "content": build_story_system_prompt(state, world_state)},
        {"role": "user", "content": prompt},
    ]
    try:
        text = strip_thoughts(
            (
                await asyncio.wait_for(
                    ollama_chat_with_model(
                        messages,
                        fast=True,
                        model_name=CLERK_MODEL_NAME,
                        fallback_model=CLERK_FALLBACK_MODEL,
                    ),
                    timeout=15,
                )
            ).strip()
        )
    except asyncio.TimeoutError:
        text = ""
    text, hint = split_narration_hint(text)
    if hint:
        state["narration_hint"] = hint
    if text:
        return strip_state_leaks(text, state, world_state)
    # fallback to deterministic intro
    identity = ""
    if name and klass:
        identity = f"{name}, the {klass}, "
    elif name:
        identity = f"{name} "
    elif klass:
        identity = f"The {klass} "
    campaign = world_state.get("campaign") if isinstance(world_state, dict) else {}
    summary = ""
    if isinstance(campaign, dict):
        summary = str(campaign.get("summary") or "").strip()
    if not summary:
        summary = DEFAULT_CAMPAIGN_BRIEF
    parts = [part.strip() for part in summary.split(".") if part.strip()]
    seed = parts[0] if parts else summary
    seed = seed.rstrip(". ")
    lead = f"{seed} {identity}steps into the trouble promised by the campaign's opening.".strip()
    if not lead.endswith("."):
        lead = f"{lead}."
    return f"{lead} What do you do?"

async def generate_narrator_intro_followup(
    state: Dict[str, Any], world_state: Dict[str, Any], name: str, klass: str, base_intro: str
) -> str:
    identity = ""
    if name and klass:
        identity = f"The hero is {name}, a {klass}."
    elif name:
        identity = f"The hero is {name}."
    elif klass:
        identity = f"The hero is a {klass}."
    prompt = (
        "Expand the opening in 2-3 sentences without repeating. "
        "End with a direct question. "
        + identity
        + " Base intro: "
        + base_intro
    ).strip()
    messages = [
        {"role": "system", "content": build_story_system_prompt(state, world_state)},
        {"role": "user", "content": prompt},
    ]
    text = strip_thoughts((await ollama_chat(messages, fast=False)).strip())
    if text:
        text, _ = split_narration_hint(text)
        return strip_state_leaks(text, state, world_state)
    return ""

def build_campaign_intro_fallback(
    world_state: Dict[str, Any], name: str, klass: str
) -> str:
    campaign = world_state.get("campaign") if isinstance(world_state, dict) else {}
    summary = ""
    if isinstance(campaign, dict):
        summary = str(campaign.get("summary") or "").strip()
    if not summary:
        summary = DEFAULT_CAMPAIGN_BRIEF
    parts = [part.strip() for part in summary.split(".") if part.strip()]
    seed = ". ".join(parts[:2]) if parts else summary
    identity = ""
    if name and klass:
        identity = f"{name}, the {klass}, "
    elif name:
        identity = f"{name} "
    elif klass:
        identity = f"The {klass} "
    opener = f"{identity}steps into the trouble promised by the campaign's opening."
    question = "What do you do?"
    if seed:
        return f"{seed}. {opener} {question}"
    return f"{opener} {question}"

def fallback_reply(messages: List[Dict[str, str]]) -> str:
    variations = [
        "A cold draft sweeps the corridor. What do you do next?",
        "Somewhere ahead, a chain rattles. How do you respond?",
        "The air smells of damp stone and old smoke. Your move?",
    ]
    return random.choice(variations)

INTRO_FALLBACKS_PATH = Path(__file__).resolve().parent / "intro_fallbacks.json"
INTRO_FALLBACKS_DEFAULT = [
    "A rusted gate groans at the mouth of a collapsed crypt. A lone lantern flickers as if waiting. Do you enter or scout?",
    "Rain drums hard beside a stairwell of wet stone. A faint blue glow leaks from a seam. Do you touch it or back away?",
    "The ground trembles over a pit that exhales warm air. Fresh footprints vanish into the dark. Do you follow or listen?",
    "A cracked bell tolls once under a ceiling of cracked tiles. The air smells of iron and smoke. Do you descend or search?",
    "Cold wind pushes through a tunnel lined with broken banners. A soft scraping answers your step. Do you press on or hold?",
]

def load_intro_fallbacks() -> List[str]:
    try:
        raw = INTRO_FALLBACKS_PATH.read_text(encoding="ascii")
        data = json.loads(raw)
        if isinstance(data, list):
            cleaned = [str(item).strip() for item in data if str(item).strip()]
            if cleaned:
                return cleaned
    except Exception:
        logger.exception("Failed to load intro fallbacks")
    return INTRO_FALLBACKS_DEFAULT

INTRO_FALLBACKS = load_intro_fallbacks()

def pick_intro_fallback() -> str:
    return random.choice(INTRO_FALLBACKS or INTRO_FALLBACKS_DEFAULT)

def should_use_heavy_model(
    state: Dict[str, Any], world_updates: List[str], story_input: str
) -> bool:
    if state.get("pending_encounter"):
        return True
    for entry in world_updates:
        if "level up" in str(entry).lower():
            return True
    if "an encounter begins" in str(story_input).lower():
        return True
    return False

def count_words(text: str) -> int:
    return len([part for part in text.strip().split() if part])

def ends_with_sentence(text: str) -> bool:
    return text.strip().endswith((".", "!", "?"))


def has_action_prompt(text: str) -> bool:
    cleaned = str(text or "").strip().lower()
    if not cleaned:
        return False
    if "?" in cleaned:
        return True
    triggers = [
        "what do you do",
        "what do you do next",
        "what happens next",
        "how do you respond",
        "your move",
        "your turn",
        "next move",
    ]
    return any(trigger in cleaned for trigger in triggers)

async def generate_nonempty_response(
    messages: List[Dict[str, str]],
    fast: bool,
    model_name: Optional[str] = None,
    fallback_model: Optional[str] = None,
) -> str:
    model = model_name or MODEL_NAME
    fallback = fallback_model or (FALLBACK_MODEL_NAME if model == MODEL_NAME else model)
    response_text = strip_thoughts(
        (await ollama_chat_with_model(messages, fast, model_name=model, fallback_model=fallback)).strip()
    )
    if response_text:
        return response_text
    retry_text = strip_thoughts(
        (
            await ollama_chat_with_model(
                build_retry_messages(messages),
                fast,
                model_name=model,
                fallback_model=fallback,
            )
        ).strip()
    )
    if retry_text:
        return retry_text
    return fallback_reply(messages)

async def generate_min_response(
    messages: List[Dict[str, str]],
    fast: bool,
    min_words: int,
    model_name: Optional[str] = None,
    fallback_model: Optional[str] = None,
) -> str:
    model = model_name or MODEL_NAME
    fallback = fallback_model or (FALLBACK_MODEL_NAME if model == MODEL_NAME else model)
    response_text = strip_thoughts(
        (await ollama_chat_with_model(messages, fast, model_name=model, fallback_model=fallback)).strip()
    )
    if count_words(response_text) >= min_words:
        if ends_with_sentence(response_text):
            return response_text
        continuation = strip_thoughts(
            (
                await ollama_chat_with_model(
                    build_continue_messages(messages),
                    fast,
                    model_name=model,
                    fallback_model=fallback,
                )
            ).strip()
        )
        if continuation:
            return (response_text + " " + continuation).strip()
        return response_text
    retry_text = strip_thoughts(
        (
            await ollama_chat_with_model(
                build_continue_messages(messages),
                fast,
                model_name=model,
                fallback_model=fallback,
            )
        ).strip()
    )
    if retry_text:
        combined = (response_text + " " + retry_text).strip()
        if count_words(combined) >= min_words:
            return combined
        if count_words(retry_text) >= min_words:
            return retry_text
    if response_text:
        return response_text
    return fallback_reply(messages)

async def ollama_stream(messages: List[Dict[str, str]], fast: bool) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=None) as client:
        payload = {
            "model": MODEL_NAME,
            "messages": messages,
            "stream": True,
            "options": build_ollama_options(fast),
        }
        async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as response:
            if should_retry_with_fallback(response, payload["model"]):
                logger.warning(
                    "Ollama model '%s' failed; falling back to '%s'.",
                    payload["model"],
                    FALLBACK_MODEL_NAME,
                )
                payload["model"] = FALLBACK_MODEL_NAME
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/chat",
                    json=payload,
                ) as fallback_response:
                    fallback_response.raise_for_status()
                    async for line in fallback_response.aiter_lines():
                        if not line:
                            continue
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content")
                        if content:
                            yield content
                        if chunk.get("done"):
                            break
                return
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                content = chunk.get("message", {}).get("content")
                if content:
                    yield content
                if chunk.get("done"):
                    break

async def stream_response(
    session: Dict[str, Any], message: str, fast: bool, user: Optional[Dict[str, Any]] = None
) -> StreamingResponse:
    session["messages"].append({"role": "user", "content": message})
    session["pending_reply"] = True
    session["last_user_at"] = stamp_now()
    persist_sessions()

    async def event_stream() -> AsyncGenerator[str, None]:
        assistant_parts: List[str] = []
        in_think = False
        prefix_checked = False
        buffer = ""
        yield "data: {\"ready\": true}\n\n"
        try:
            async for chunk in ollama_stream(session["messages"], fast):
                if not chunk:
                    continue
                cleaned = chunk
                if "<think>" in cleaned:
                    prefix, _, rest = cleaned.partition("<think>")
                    cleaned = prefix
                    in_think = True
                    if prefix:
                        assistant_parts.append(prefix)
                        data = json.dumps({"delta": prefix})
                        yield f"data: {data}\n\n"
                    if not rest:
                        continue
                    cleaned = rest
                if in_think:
                    if "</think>" in cleaned:
                        _, _, tail = cleaned.partition("</think>")
                        cleaned = tail
                        in_think = False
                    else:
                        continue
                cleaned = cleaned.replace("</think>", "").replace("<think>", "")
                if cleaned:
                    if not prefix_checked:
                        buffer += cleaned
                        if len(buffer) > 25:
                            stripped = strip_prefixes(buffer)
                            prefix_checked = True
                            if stripped:
                                assistant_parts.append(stripped)
                                data = json.dumps({"delta": stripped})
                                yield f"data: {data}\n\n"
                            buffer = ""
                    else:
                        assistant_parts.append(cleaned)
                        data = json.dumps({"delta": cleaned})
                        yield f"data: {data}\n\n"
        except httpx.HTTPError as exc:
            data = json.dumps({"error": f"Ollama error: {exc}"})
            yield f"data: {data}\n\n"
            return
            
        # Flush any remaining buffer if we never hit the threshold
        if not prefix_checked and buffer:
             stripped = strip_prefixes(buffer)
             if stripped:
                 assistant_parts.append(stripped)
                 data = json.dumps({"delta": stripped})
                 yield f"data: {data}\n\n"
                 
        response_text = "".join(assistant_parts).strip()
        response_text = strip_thoughts(response_text)
        if count_words(response_text) < (18 if fast else 28):
            response_text = await generate_min_response(
                session["messages"], fast, 18 if fast else 28
            )
            data = json.dumps({"delta": response_text})
            yield f"data: {data}\n\n"
        last_assistant = get_last_assistant_message(session["messages"])
        if last_assistant and response_text.strip() == last_assistant.strip():
            retry_context = build_avoid_repeat_messages(without_last_assistant(session["messages"]))
            response_text = await generate_min_response(retry_context, fast, 18 if fast else 28)
            if response_text.strip() == last_assistant.strip():
                response_text = fallback_reply(session["messages"])
            data = json.dumps({"delta": response_text})
            yield f"data: {data}\n\n"
        session["messages"].append({"role": "assistant", "content": response_text})
        session["pending_reply"] = False
        session["last_assistant_at"] = stamp_now()
        session["last_assistant_message"] = response_text
        if user is not None:
            user["credits"] = max(0, int(user.get("credits", 0)) - 1)
            save_simple_store(USERS_STORE_PATH, users_store)
        persist_sessions()
        yield "data: {\"done\": true}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)

# --- Routes ---
@app.on_event("startup")
async def startup_load_rules():
    load_rules_sessions()
    global sessions
    sessions = load_sessions()
    global world_state_store
    world_state_store = load_world_state()
    global custom_characters, custom_bestiary, bestiary_srd, spells_srd
    custom_characters = load_json_store(CHARACTER_STORE_PATH, "characters")
    custom_bestiary = load_json_store(BESTIARY_CUSTOM_PATH, "monsters")
    bestiary_srd = load_bestiary_srd()
    spells_srd = load_spells_srd()
    global users_store, login_codes, redeem_codes, wallet_nonces, payment_orders, payment_state, payment_watcher_task, world_enhancer_task, lore_generator_task
    users_store = load_simple_store(USERS_STORE_PATH)
    login_codes = load_simple_store(LOGIN_CODES_PATH)
    redeem_codes = load_simple_store(REDEEM_CODES_PATH)
    wallet_nonces = load_simple_store(WALLET_NONCES_PATH)
    payment_orders = load_simple_store(PAYMENTS_ORDERS_PATH)
    payment_state = load_simple_store(PAYMENTS_STATE_PATH)
    if not isinstance(payment_orders, dict):
        payment_orders = {}
    if not isinstance(payment_state, dict):
        payment_state = {}
    if not isinstance(wallet_nonces, dict):
        wallet_nonces = {}
    if payment_watcher_task is None:
        payment_watcher_task = asyncio.create_task(payment_watcher_loop())
    if world_enhancer_task is None:
        world_enhancer_task = asyncio.create_task(world_enhancer_loop())
    if lore_generator_task is None:
        lore_generator_task = asyncio.create_task(lore_generator_loop())
    if lore_generator_task is None:
        lore_generator_task = asyncio.create_task(lore_generator_loop())

@app.get("/")
async def root():
    return {"message": "AI Dungeon Master Backend is running!"}


@app.get("/privacy")
async def privacy_policy():
    if not PRIVACY_POLICY_PATH.exists():
        raise HTTPException(status_code=404, detail="Privacy policy not found.")
    return FileResponse(PRIVACY_POLICY_PATH, media_type="text/html")

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME}

@app.post("/api/auth/request")
async def auth_request(payload: AuthRequest):
    email = normalize_email(payload.email)
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    get_or_create_user(email)
    return {"status": "ok", "message": "Login code requested. Contact admin for your code."}

@app.post("/api/auth/verify", response_model=AuthResponse)
async def auth_verify(payload: AuthVerifyRequest):
    email = normalize_email(payload.email)
    code = payload.code.strip().upper()
    if not email or not code:
        raise HTTPException(status_code=400, detail="Email and code required")
    expected = login_codes.get(email)
    if not expected or expected != code:
        raise HTTPException(status_code=401, detail="Invalid login code")
    user = get_or_create_user(email)
    token = str(uuid.uuid4())
    user["token"] = token
    user["provider"] = "email"
    user["guest"] = False
    login_codes.pop(email, None)
    save_simple_store(LOGIN_CODES_PATH, login_codes)
    save_simple_store(USERS_STORE_PATH, users_store)
    return AuthResponse(token=token, credits=int(user.get("credits", 0)), wallet=user.get("wallet"))

@app.post("/api/auth/wallet/nonce", response_model=WalletNonceResponse)
async def wallet_nonce(payload: WalletNonceRequest):
    address = normalize_wallet(payload.address)
    if not address:
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    nonce = uuid.uuid4().hex
    message = build_wallet_message(address, nonce)
    wallet_nonces[address] = {
        "nonce": nonce,
        "created_at": datetime.utcnow().isoformat(),
    }
    save_simple_store(WALLET_NONCES_PATH, wallet_nonces)
    return WalletNonceResponse(address=address, message=message)

@app.post("/api/auth/wallet/verify", response_model=AuthResponse)
async def wallet_verify(payload: WalletVerifyRequest):
    address = normalize_wallet(payload.address)
    signature = payload.signature.strip()
    if not address or not signature:
        raise HTTPException(status_code=400, detail="Address and signature required")
    entry = wallet_nonces.get(address)
    if not entry:
        raise HTTPException(status_code=400, detail="Nonce not found")
    message = build_wallet_message(address, entry.get("nonce", ""))
    try:
        if payload.typed_data:
            typed_message = payload.typed_data.get("message", {}).get("contents", "")
            if typed_message != message:
                raise HTTPException(status_code=400, detail="Signature payload mismatch")
            recovered = Account.recover_message(
                encode_structured_data(payload.typed_data),
                signature=signature,
            )
        else:
            recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid signature") from exc
    if normalize_wallet(recovered) != address:
        raise HTTPException(status_code=401, detail="Signature mismatch")
    user = get_or_create_user_wallet(address)
    token = str(uuid.uuid4())
    user["token"] = token
    user["provider"] = "wallet"
    user["guest"] = False
    wallet_nonces.pop(address, None)
    save_simple_store(WALLET_NONCES_PATH, wallet_nonces)
    save_simple_store(USERS_STORE_PATH, users_store)
    return AuthResponse(token=token, credits=int(user.get("credits", 0)), wallet=user.get("wallet"))

@app.post("/api/auth/google", response_model=AuthResponse)
async def auth_google(payload: GoogleAuthRequest):
    token_value = payload.id_token.strip()
    if not token_value:
        raise HTTPException(status_code=400, detail="Missing Google token")
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google client not configured")
    if google_id_token is None or google_requests is None:
        raise HTTPException(status_code=500, detail="Google auth dependencies missing")
    try:
        claims = google_id_token.verify_oauth2_token(
            token_value, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Google token") from exc
    email = normalize_email(claims.get("email") or "")
    if not email:
        raise HTTPException(status_code=400, detail="Google account missing email")
    user = get_or_create_user(email)
    token = str(uuid.uuid4())
    user["token"] = token
    user["provider"] = "google"
    user["guest"] = False
    save_simple_store(USERS_STORE_PATH, users_store)
    return AuthResponse(token=token, credits=int(user.get("credits", 0)), wallet=user.get("wallet"))

@app.post("/api/auth/guest", response_model=AuthResponse)
async def auth_guest():
    user_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    users_store[user_id] = {
        "id": user_id,
        "email": None,
        "wallet": None,
        "credits": STARTING_CREDITS,
        "token": token,
        "guest": True,
        "provider": "guest",
    }
    save_simple_store(USERS_STORE_PATH, users_store)
    return AuthResponse(token=token, credits=int(STARTING_CREDITS), wallet=None)

@app.get("/api/me")
async def get_me(user: Dict[str, Any] = Depends(require_auth)):
    return {
        "email": user.get("email"),
        "wallet": user.get("wallet"),
        "credits": int(user.get("credits", 0)),
        "guest": bool(user.get("guest")),
        "provider": user.get("provider"),
    }

@app.post("/api/redeem", response_model=RedeemResponse)
async def redeem_code(payload: RedeemRequest, user: Dict[str, Any] = Depends(require_auth)):
    code = payload.code.strip().upper()
    entry = redeem_codes.get(code)
    if not entry or entry.get("redeemed"):
        raise HTTPException(status_code=400, detail="Invalid or redeemed code")
    credits = int(entry.get("credits", 0))
    user["credits"] = int(user.get("credits", 0)) + credits
    entry["redeemed"] = True
    entry["redeemed_by"] = user.get("email")
    entry["redeemed_at"] = datetime.utcnow().isoformat()
    save_simple_store(REDEEM_CODES_PATH, redeem_codes)
    save_simple_store(USERS_STORE_PATH, users_store)
    return RedeemResponse(credits=int(user.get("credits", 0)))

@app.post("/api/admin/login-code", response_model=AdminLoginCodeResponse)
async def admin_login_code(payload: AdminLoginCodeRequest, x_admin_key: Optional[str] = Header(default=None)):
    require_admin(x_admin_key)
    email = normalize_email(payload.email)
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    code = generate_code(prefix="LOGIN", length=6)
    login_codes[email] = code
    save_simple_store(LOGIN_CODES_PATH, login_codes)
    return AdminLoginCodeResponse(code=code)

@app.post("/api/admin/redeem-code", response_model=AdminRedeemCodeResponse)
async def admin_redeem_code(payload: AdminRedeemCodeRequest, x_admin_key: Optional[str] = Header(default=None)):
    require_admin(x_admin_key)
    credits = int(payload.credits)
    if credits <= 0:
        raise HTTPException(status_code=400, detail="Credits must be positive")
    code = generate_code(prefix="PACK", length=8)
    redeem_codes[code] = {
        "credits": credits,
        "redeemed": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    save_simple_store(REDEEM_CODES_PATH, redeem_codes)
    return AdminRedeemCodeResponse(code=code)

@app.post("/api/admin/credit", response_model=AdminCreditResponse)
async def admin_credit_user(payload: AdminCreditRequest, x_admin_key: Optional[str] = Header(default=None)):
    require_admin(x_admin_key)
    email = normalize_email(payload.email or "")
    wallet = normalize_wallet(payload.wallet or "")
    credits = int(payload.credits)
    if not email and not wallet:
        raise HTTPException(status_code=400, detail="Email or wallet required")
    if credits == 0:
        raise HTTPException(status_code=400, detail="Credits must be non-zero")
    if wallet:
        user = get_or_create_user_wallet(wallet)
    else:
        user = get_or_create_user(email)
    user["credits"] = int(user.get("credits", 0)) + credits
    save_simple_store(USERS_STORE_PATH, users_store)
    return AdminCreditResponse(credits=int(user.get("credits", 0)))

@app.get("/api/payments/packs")
async def list_payment_packs():
    packs = []
    for credits, price in sorted(get_price_table().items()):
        packs.append(
            {
                "credits": credits,
                "amount": format_usdt(price),
            }
        )
    return {"wallet": PAYMENT_WALLET_ADDRESS, "usdt_contract": USDT_CONTRACT_ADDRESS, "packs": packs}

@app.post("/api/payments/create", response_model=PaymentCreateResponse)
async def create_payment_order(payload: PaymentCreateRequest, user: Dict[str, Any] = Depends(require_auth)):
    if not PAYMENT_WALLET_ADDRESS:
        raise HTTPException(status_code=400, detail="Payment wallet not configured")
    if not user.get("wallet"):
        raise HTTPException(status_code=400, detail="Wallet login required")
    credits = int(payload.credits)
    if credits <= 0:
        raise HTTPException(status_code=400, detail="Credits must be positive")
    base_price = get_base_price_for_credits(credits)
    amount = generate_unique_amount(base_price)
    amount_str = format_usdt(amount)
    try:
        created_block = await get_latest_block()
    except Exception:
        created_block = None
    order_id = str(uuid.uuid4())
    payment_orders[order_id] = {
        "id": order_id,
        "user_id": user.get("id"),
        "email": user.get("email"),
        "wallet": user.get("wallet"),
        "credits": credits,
        "amount": amount_str,
        "address": PAYMENT_WALLET_ADDRESS,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "created_block": created_block,
    }
    save_payments()
    return PaymentCreateResponse(
        order_id=order_id,
        address=PAYMENT_WALLET_ADDRESS,
        amount=amount_str,
        credits=credits,
        status="pending",
    )

@app.get("/api/payments/status/{order_id}", response_model=PaymentStatusResponse)
async def payment_status(order_id: str, user: Dict[str, Any] = Depends(require_auth)):
    order = payment_orders.get(order_id)
    if not order or order.get("user_id") != user.get("id"):
        raise HTTPException(status_code=404, detail="Order not found")
    return PaymentStatusResponse(
        order_id=order.get("id"),
        status=order.get("status", "pending"),
        credits=int(order.get("credits", 0)),
        address=order.get("address", PAYMENT_WALLET_ADDRESS),
        amount=order.get("amount", ""),
        tx_hash=order.get("tx_hash"),
        confirmations=int(order.get("confirmations", 0)),
    )

@app.post("/api/payments/play", response_model=PlayPurchaseResponse)
async def register_play_purchase(
    payload: PlayPurchaseRequest, user: Dict[str, Any] = Depends(require_auth)
):
    product_id = payload.product_id
    credits = PLAY_PRODUCT_CREDITS.get(product_id)
    if credits is None:
        raise HTTPException(status_code=400, detail="Unknown product")
    user["credits"] = int(user.get("credits", 0)) + credits
    order_id = str(uuid.uuid4())
    payment_orders[order_id] = {
        "id": order_id,
        "user_id": user.get("id"),
        "email": user.get("email"),
        "wallet": user.get("wallet"),
        "credits": credits,
        "amount": payload.product_id,
        "address": "google_play",
        "status": "completed",
        "created_at": stamp_now(),
        "transaction_id": payload.transaction_id,
        "purchase_token": payload.purchase_token,
        "source": "play",
    }
    save_simple_store(USERS_STORE_PATH, users_store)
    save_payments()
    return PlayPurchaseResponse(credits=int(user.get("credits", 0)), product=product_id)

@app.post("/api/sessions", response_model=CreateSessionResponse, dependencies=[Depends(verify_api_key)])
async def create_session(payload: CreateSessionRequest, user: Dict[str, Any] = Depends(require_auth)):
    session_id = str(uuid.uuid4())
    system_prompt = payload.system_prompt or DEFAULT_SYSTEM_PROMPT
    if payload.messages:
        messages = [message.model_dump() for message in payload.messages]
        has_system = any(message["role"] == "system" for message in messages)
        if not has_system:
            messages.insert(0, {"role": "system", "content": system_prompt})
    else:
        messages = [{"role": "system", "content": system_prompt}]
    sessions[session_id] = {
        "created_at": datetime.utcnow().isoformat(),
        "metadata": payload.metadata or {},
        "messages": messages,
        "pending_reply": False,
        "last_user_at": None,
        "last_assistant_at": None,
        "last_assistant_message": None,
        "game_state": default_game_state(),
    }
    ensure_world_state(session_id)
    persist_sessions()
    return CreateSessionResponse(session_id=session_id)

@app.post("/api/sessions/import", response_model=CreateSessionResponse, dependencies=[Depends(verify_api_key)])
async def import_session(payload: ImportSessionRequest, user: Dict[str, Any] = Depends(require_auth)):
    session_id = str(uuid.uuid4())
    system_prompt = payload.system_prompt or DEFAULT_SYSTEM_PROMPT
    messages = [message.model_dump() for message in payload.messages]
    has_system = any(message["role"] == "system" for message in messages)
    if not has_system:
        messages.insert(0, {"role": "system", "content": system_prompt})
    sessions[session_id] = {
        "created_at": datetime.utcnow().isoformat(),
        "metadata": payload.metadata or {},
        "messages": messages,
        "pending_reply": False,
        "last_user_at": None,
        "last_assistant_at": None,
        "last_assistant_message": None,
        "game_state": default_game_state(),
    }
    ensure_world_state(session_id)
    persist_sessions()
    return CreateSessionResponse(session_id=session_id)

@app.get("/api/sessions/{session_id}", dependencies=[Depends(verify_api_key)])
async def get_session_details(session_id: str, user: Dict[str, Any] = Depends(require_auth)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.get("/api/sessions/{session_id}/messages", dependencies=[Depends(verify_api_key)])
async def get_session_messages_list(session_id: str, user: Dict[str, Any] = Depends(require_auth)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.get("messages", [])

@app.post(
    "/api/sessions/{session_id}/messages",
    response_model=SendMessageResponse,
    dependencies=[Depends(verify_api_key)],
)
async def send_message(
    session_id: str,
    payload: SendMessageRequest,
    user: Dict[str, Any] = Depends(require_auth),
):
    session = get_session_or_404(session_id)
    if user.get("credits", 0) <= 0:
        raise HTTPException(status_code=402, detail="Out of credits")
    ensure_session_state(session)
    session["pending_reply"] = True
    session["last_user_at"] = stamp_now()
    fast = bool(payload.fast)
    world_state = ensure_world_state(session_id)
    try:
        clerk_result = await clerk_update_state(
            session["game_state"], world_state, payload.message, session_id=session_id
        )
        session["game_state"] = clerk_result["state"]
        world_state = clerk_result.get("world_state") or world_state
        world_state = apply_world_updates(world_state, clerk_result.get("world_updates") or [])
        world_summary = str(clerk_result.get("world_summary") or "").strip()
        if world_summary:
            world_state["summary"] = world_summary
            world_state["updated_at"] = stamp_now()
        world_state_store[session_id] = world_state
        persist_world_state()
        story_input = clerk_result["story_input"]
    except httpx.HTTPError as exc:
        logger.warning("Clerk model failed: %s", exc)
        clerk_result = {
            "should_narrate": True,
            "player_reply": "Noted.",
        }
        story_input = payload.message
    session["messages"].append({"role": "user", "content": story_input})
    try:
        response_parts = None
        action_type = str(clerk_result.get("action_type") or "").strip().lower()
        force_narrate = last_assistant_asked_question(session["messages"])
        should_narrate = action_type != "equip"
        if action_type != "equip":
            should_narrate = should_narrate or force_narrate
        if not should_narrate:
            response_text = clerk_result.get("player_reply") or "Noted."
        else:
            use_heavy = should_use_heavy_model(
                session["game_state"],
                clerk_result.get("world_updates") or [],
                story_input,
            )
            model_name = HEAVY_MODEL_NAME if use_heavy else MODEL_NAME
            fallback_model = HEAVY_FALLBACK_MODEL if use_heavy else FALLBACK_MODEL_NAME
            history = [msg for msg in session["messages"] if msg.get("role") != "system"]
            tail = get_last_turn_messages(history)
            model_messages = [
                {
                    "role": "system",
                    "content": build_story_system_prompt(session["game_state"], world_state),
                },
                *tail,
                {"role": "user", "content": story_input},
            ]
            response_text = await generate_min_response(
                model_messages,
                fast,
                28,
                model_name=model_name,
                fallback_model=fallback_model,
            )
            last_assistant = get_last_assistant_message(session["messages"])
            if last_assistant and response_text.strip() == last_assistant.strip():
                retry_context = build_avoid_repeat_messages(without_last_assistant(model_messages))
                response_text = await generate_min_response(
                    retry_context,
                    fast,
                    28,
                    model_name=model_name,
                    fallback_model=fallback_model,
                )
                if response_text.strip() == last_assistant.strip():
                    response_text = fallback_reply(model_messages)
            if response_text and not ends_with_sentence(response_text):
                continuation = await generate_min_response(
                    build_continue_messages(model_messages),
                    fast,
                    14,
                    model_name=model_name,
                    fallback_model=fallback_model,
                )
                if continuation:
                    response_parts = [response_text, continuation]
            if response_parts:
                cleaned_parts = []
                for part in response_parts:
                    cleaned_part, hint = split_narration_hint(part)
                    if hint:
                        session["game_state"]["narration_hint"] = hint
                    cleaned_part = await clerk_filter_story(
                        session["game_state"], world_state, cleaned_part
                    )
                    cleaned_part = strip_state_leaks(
                        cleaned_part, session["game_state"], world_state
                    )
                    if cleaned_part:
                        cleaned_parts.append(cleaned_part)
                if cleaned_parts:
                    response_parts = cleaned_parts
                    response_text = cleaned_parts[0]
                else:
                    response_parts = None
            if not response_parts:
                response_text, hint = split_narration_hint(response_text)
                if hint:
                    session["game_state"]["narration_hint"] = hint
                response_text = await clerk_filter_story(
                    session["game_state"], world_state, response_text
                )
                response_text = strip_state_leaks(
                    response_text, session["game_state"], world_state
                )
    except httpx.TimeoutException:
        response_text = fallback_reply(session["messages"])
        logger.warning("Ollama timeout for session %s", session_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama error: {exc}") from exc
    response_parts = response_parts if "response_parts" in locals() else None
    if response_parts:
        for part in response_parts:
            cleaned = part.strip()
            if cleaned:
                session["messages"].append({"role": "assistant", "content": cleaned})
        session["last_assistant_message"] = response_parts[-1].strip()
    else:
        session["messages"].append({"role": "assistant", "content": response_text})
        session["last_assistant_message"] = response_text
    if not has_action_prompt(session["last_assistant_message"]):
        follow_up = "What do you do next?"
        session["messages"].append({"role": "assistant", "content": follow_up})
        session["last_assistant_message"] = follow_up
        if response_parts:
            response_parts = [*response_parts, follow_up]
        else:
            response_parts = [response_text, follow_up]
    if should_narrate and session["game_state"].get("loot_pending"):
        session["game_state"]["loot_pending"] = []
    encounter_payload = session.get("game_state", {}).get("pending_encounter")
    session["pending_reply"] = False
    session["last_assistant_at"] = stamp_now()
    user["credits"] = max(0, int(user.get("credits", 0)) - 1)
    save_simple_store(USERS_STORE_PATH, users_store)
    persist_sessions()
    if should_narrate and session["game_state"].get("pending_encounter"):
        session["game_state"]["pending_encounter"] = None
    return SendMessageResponse(
        response=response_text,
        session_id=session_id,
        response_parts=response_parts,
        game_state=session.get("game_state"),
        encounter=encounter_payload,
    )


@app.post(
    "/api/sessions/{session_id}/continue",
    response_model=SendMessageResponse,
    dependencies=[Depends(verify_api_key)],
)
async def continue_message(
    session_id: str,
    payload: ContinueRequest,
    user: Dict[str, Any] = Depends(require_auth),
):
    session = get_session_or_404(session_id)
    if user.get("credits", 0) <= 0:
        raise HTTPException(status_code=402, detail="Out of credits")
    ensure_session_state(session)
    session["pending_reply"] = True
    session["last_user_at"] = stamp_now()
    fast = bool(payload.fast)
    world_state = ensure_world_state(session_id)
    try:
        history = [msg for msg in session["messages"] if msg.get("role") != "system"]
        tail = get_last_turn_messages(history)
        model_messages = [
            {"role": "system", "content": build_story_system_prompt(session["game_state"], world_state)},
            *tail,
        ]
        continue_messages = build_continue_messages(build_avoid_repeat_messages(model_messages))
        use_heavy = should_use_heavy_model(
            session["game_state"],
            [],
            "",
        )
        model_name = HEAVY_MODEL_NAME if use_heavy else MODEL_NAME
        fallback_model = HEAVY_FALLBACK_MODEL if use_heavy else FALLBACK_MODEL_NAME
        response_text = await generate_min_response(
            continue_messages,
            fast,
            28,
            model_name=model_name,
            fallback_model=fallback_model,
        )
        last_assistant = get_last_assistant_message(session["messages"])
        if last_assistant and response_text.strip() == last_assistant.strip():
            retry_context = build_avoid_repeat_messages(without_last_assistant(model_messages))
            response_text = await generate_min_response(
                build_continue_messages(retry_context),
                fast,
                28,
                model_name=model_name,
                fallback_model=fallback_model,
            )
            if response_text.strip() == last_assistant.strip():
                response_text = fallback_reply(model_messages)
        if response_text and not ends_with_sentence(response_text):
            continuation = await generate_min_response(
                build_continue_messages(model_messages),
                fast,
                14,
                model_name=model_name,
                fallback_model=fallback_model,
            )
            if continuation:
                response_text = (response_text + " " + continuation).strip()
        response_text, hint = split_narration_hint(response_text)
        if hint:
            session["game_state"]["narration_hint"] = hint
        response_text = await clerk_filter_story(session["game_state"], world_state, response_text)
        response_text = strip_state_leaks(response_text, session["game_state"], world_state)
    except httpx.TimeoutException:
        response_text = fallback_reply(session["messages"])
        logger.warning("Ollama timeout for session %s", session_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama error: {exc}") from exc
    session["messages"].append({"role": "assistant", "content": response_text})
    session["last_assistant_message"] = response_text
    response_parts = None
    if not has_action_prompt(session["last_assistant_message"]):
        follow_up = "What do you do next?"
        session["messages"].append({"role": "assistant", "content": follow_up})
        session["last_assistant_message"] = follow_up
        response_parts = [response_text, follow_up]
    session["pending_reply"] = False
    session["last_assistant_at"] = stamp_now()
    user["credits"] = max(0, int(user.get("credits", 0)) - 1)
    save_simple_store(USERS_STORE_PATH, users_store)
    persist_sessions()
    return SendMessageResponse(
        response=response_text,
        session_id=session_id,
        response_parts=response_parts,
        game_state=session.get("game_state"),
    )

@app.post("/api/sessions/{session_id}/stream", dependencies=[Depends(verify_api_key)])
async def stream_message(session_id: str, payload: SendMessageRequest, user: Dict[str, Any] = Depends(require_auth)):
    if user.get("credits", 0) <= 0:
        raise HTTPException(status_code=402, detail="Out of credits")
    session = get_session_or_404(session_id)
    return await stream_response(session, payload.message, bool(payload.fast), user=user)

@app.get("/api/sessions/{session_id}/status", dependencies=[Depends(verify_api_key)])
async def session_status(session_id: str, user: Dict[str, Any] = Depends(require_auth)):
    session = get_session_or_404(session_id)
    return {
        "pending_reply": bool(session.get("pending_reply")),
        "last_user_at": session.get("last_user_at"),
        "last_assistant_at": session.get("last_assistant_at"),
        "last_assistant_message": session.get("last_assistant_message"),
    }

@app.get("/api/sessions/{session_id}/stream", dependencies=[Depends(verify_api_key)])
async def stream_message_get(
    session_id: str,
    message: str = Query(...),
    fast: bool = Query(False),
    user: Dict[str, Any] = Depends(require_auth),
):
    if user.get("credits", 0) <= 0:
        raise HTTPException(status_code=402, detail="Out of credits")
    session = get_session_or_404(session_id)
    return await stream_response(session, message, fast, user=user)

@app.post("/api/intro", response_model=IntroResponse)
async def generate_intro(payload: IntroRequest, user: Dict[str, Any] = Depends(require_auth)):
    name = (payload.name or "").strip()
    klass = (payload.klass or "").strip()
    start_time = time.monotonic()
    try:
        temp_state = default_game_state()
        temp_world = apply_character_to_world(default_world_state(), name, klass, None)
        temp_world = await ensure_campaign_brief(
            temp_state,
            temp_world,
            name,
            klass,
            lock_key="intro",
        )
        text = await generate_intro_story(temp_state, temp_world, name, klass)
        if text:
            logger.info("Intro generation completed in %.2fs", time.monotonic() - start_time)
            return IntroResponse(intro=text)
        logger.warning(
            "Intro generation returned empty response after %.2fs",
            time.monotonic() - start_time,
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "Intro generation failed after %.2fs: %s",
            time.monotonic() - start_time,
            exc,
        )
    return IntroResponse(intro=pick_intro_fallback())

@app.post(
    "/api/sessions/{session_id}/intro",
    response_model=IntroResponse,
    dependencies=[Depends(verify_api_key)],
)
async def generate_session_intro(
    session_id: str,
    payload: IntroSessionRequest,
    user: Dict[str, Any] = Depends(require_auth),
):
    lock = intro_locks.setdefault(session_id, asyncio.Lock())
    if lock.locked():
        log_clerk_event(f"intro_request waiting for lock session_id={session_id}")
    async with lock:
        session = get_session_or_404(session_id)
        ensure_session_state(session)
        log_clerk_event(f"intro_request received session_id={session_id}")
        if session.get("intro_generated") and session.get("last_assistant_message"):
            log_clerk_event(f"intro_request reused session_id={session_id}")
            return IntroResponse(intro=session["last_assistant_message"])
        world_state = ensure_world_state(session_id)
        name = (payload.name or "").strip()
        klass = (payload.klass or "").strip()
        log_clerk_event("intro_request applying character to game/world state")
        session["game_state"] = apply_character_to_state(
            session["game_state"], name, klass, payload.character
        )
        world_state = apply_character_to_world(world_state, name, klass, payload.character)
        if not world_state.get("campaign_world"):
            world_state["campaign_world"] = DEFAULT_CAMPAIGN_WORLD
        if not isinstance(world_state.get("campaign"), dict):
            world_state["campaign"] = {"summary": DEFAULT_CAMPAIGN_BRIEF, "created_at": stamp_now()}
        world_state_store[session_id] = world_state
        persist_world_state()
        try:
            log_clerk_event("intro_request generating clerk intro")
            intro = await generate_clerk_intro_fast(
                session["game_state"], world_state, name, klass
            )
        except Exception as exc:
            logger.warning("Session intro generation failed: %s", exc)
            intro = ""
        if not intro:
            log_clerk_event("intro_request empty story fallback")
            intro = pick_intro_fallback()
        session["messages"].append({"role": "assistant", "content": intro})
        session["last_assistant_at"] = stamp_now()
        session["last_assistant_message"] = intro
        session["intro_generated"] = True
        session["pending_reply"] = False

        async def _persist_intro_state() -> None:
            try:
                await asyncio.to_thread(persist_sessions)
                await asyncio.to_thread(persist_world_state)
            except Exception:
                logger.exception("Session intro persistence failed")

        asyncio.create_task(_persist_intro_state())
        log_clerk_event("intro_request responding")

        async def _background_intro_followup() -> None:
            try:
                updated_world = await ensure_campaign_brief(
                    session["game_state"],
                    world_state,
                    name,
                    klass,
                    lock_key=session_id,
                    store_key=session_id,
                )
                world_state_store[session_id] = updated_world
                persist_world_state()
            except Exception:
                logger.exception("Session intro followup failed")

        asyncio.create_task(_background_intro_followup())
        return IntroResponse(intro=intro)

# --- Rules Engine (5e SRD, strict) ---
@app.get("/api/rules/premades")
async def list_premades():
    return {
        key: {
            "name": sheet.name,
            "class": sheet.klass,
            "level": sheet.level,
            "armor_class": sheet.armor_class,
            "max_hp": sheet.max_hp,
        }
        for key, sheet in PREMADE_SHEETS.items()
    }

@app.get("/api/rules/monsters")
async def list_monsters():
    catalog = get_monster_catalog()
    return {
        key: {
            "name": monster.name,
            "armor_class": monster.armor_class,
            "max_hp": monster.max_hp,
            "damage": monster.damage,
        }
        for key, monster in catalog.items()
    }

@app.get("/api/characters")
async def list_custom_characters():
    return {
        key: {
            "name": payload.get("name"),
            "class": payload.get("class"),
            "level": payload.get("level"),
        }
        for key, payload in custom_characters.items()
    }

@app.get("/api/characters/{character_id}")
async def get_character(character_id: str):
    payload = custom_characters.get(character_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Character not found")
    return payload

@app.post("/api/characters", response_model=CharacterCreateResponse)
async def create_character(payload: CharacterCreateRequest):
    if len(payload.weapons) == 0:
        raise HTTPException(status_code=400, detail="At least one weapon is required")
    if len(payload.weapons) > 2:
        raise HTTPException(status_code=400, detail="At most two weapons are supported")
    level = int(payload.level)
    if level < 1:
        raise HTTPException(status_code=400, detail="Level must be at least 1")
    prof_bonus = 2 + max((level - 1) // 4, 0)
    weapons_payload = []
    for weapon in payload.weapons:
        weapons_payload.append(
            {
                "name": weapon.name,
                "attack_ability": weapon.attack_ability,
                "damage": weapon.damage,
                "damage_type": weapon.damage_type,
                "finesse": bool(weapon.finesse),
            }
        )
    character_id = str(uuid.uuid4())
    klass_key = payload.klass.strip().lower()
    save_profs = list(payload.save_proficiencies or CLASS_SAVE_PROFICIENCIES.get(klass_key, []))
    skill_profs = list(payload.skill_proficiencies or [])
    custom_characters[character_id] = {
        "name": payload.name,
        "class": payload.klass,
        "level": level,
        "stats": dict(payload.stats),
        "prof_bonus": prof_bonus,
        "armor_class": int(payload.armor_class),
        "max_hp": int(payload.max_hp),
        "hp": int(payload.max_hp),
        "weapons": weapons_payload,
        "race": payload.race,
        "background": payload.background,
        "alignment": payload.alignment,
        "traits": list(payload.traits or []),
        "languages": list(payload.languages or []),
        "spellcasting_ability": payload.spellcasting_ability,
        "cantrips_known": list(payload.cantrips_known or []),
        "spellbook": list(payload.spellbook or []),
        "prepared_spells": list(payload.prepared_spells or []),
        "known_spells": list(payload.known_spells or []),
        "save_proficiencies": save_profs,
        "skill_proficiencies": skill_profs,
        "conditions": list(payload.conditions or []),
        "items": list(payload.items or []),
    }
    save_json_store(CHARACTER_STORE_PATH, "characters", custom_characters)
    return CharacterCreateResponse(character_id=character_id)

@app.get("/api/bestiary")
async def list_bestiary():
    response: Dict[str, Dict[str, Any]] = {}
    for key, monster in MONSTERS.items():
        response[key] = {
            "name": monster.name,
            "armor_class": monster.armor_class,
            "max_hp": monster.max_hp,
            "attack_bonus": monster.attack_bonus,
            "damage": monster.damage,
            "damage_type": monster.damage_type,
            "source": "core",
        }
    for key, payload in bestiary_srd.items():
        response[key] = {
            **payload,
            "source": "srd",
        }
    for key, payload in custom_bestiary.items():
        response[key] = {
            **payload,
            "source": "custom",
        }
    return response

@app.post("/api/bestiary/custom", response_model=EnemyCreateResponse)
async def create_custom_enemy(payload: EnemyCreateRequest):
    enemy_id = str(uuid.uuid4())
    custom_bestiary[enemy_id] = {
        "name": payload.name,
        "armor_class": int(payload.armor_class),
        "max_hp": int(payload.max_hp),
        "attack_bonus": int(payload.attack_bonus),
        "damage": payload.damage,
        "damage_type": payload.damage_type,
    }
    save_json_store(BESTIARY_CUSTOM_PATH, "monsters", custom_bestiary)
    return EnemyCreateResponse(enemy_id=enemy_id)

@app.get("/api/rules/spells")
async def list_spells():
    response: Dict[str, Dict[str, Any]] = {}
    for spell_id, payload in spells_srd.items():
        response[spell_id] = normalize_spell_payload(spell_id, payload)
    return response

@app.post("/api/rules/sessions", response_model=RulesSessionResponse)
async def create_rules_session(payload: RulesSessionRequest):
    character_catalog = get_character_catalog()
    monster_catalog = get_monster_catalog()
    pc = character_catalog.get(payload.pc_id)
    if not pc:
        raise HTTPException(status_code=400, detail="Unknown character")
    enemy = monster_catalog.get(payload.enemy_id)
    if not enemy:
        raise HTTPException(status_code=400, detail="Unknown monster")

    pc = reset_character(pc)
    enemy = reset_monster(enemy)
    session_id = str(uuid.uuid4())
    rules_sessions[session_id] = RulesSession(
        session_id=session_id,
        pc=pc,
        enemy=enemy,
        round=1,
        story_session_id=payload.story_session_id,
        log=[f"Combat starts: {pc.name} vs {enemy.name}."],
    )
    set_story_combat_flag(payload.story_session_id, True)
    persist_rules_sessions()
    return RulesSessionResponse(
        session_id=session_id,
        pc=serialize_character(pc),
        enemy=serialize_monster(enemy),
        round=1,
    )

@app.get("/api/rules/sessions/{session_id}", response_model=RulesStateResponse)
async def get_rules_state(session_id: str):
    session = get_rules_session_or_404(session_id)
    return RulesStateResponse(
        pc=serialize_character(session.pc),
        enemy=serialize_monster(session.enemy),
        round=session.round,
        log=list(session.log),
        story=list(session.story),
    )

@app.post("/api/rules/sessions/{session_id}/attack", response_model=AttackResponse)
async def player_attack(session_id: str, payload: AttackRequest, narrate: bool = Query(False)):
    session = get_rules_session_or_404(session_id)
    if session.pc.hp <= 0 or session.enemy.hp <= 0:
        raise HTTPException(status_code=400, detail="Combat is already over")

    weapon_id = payload.weapon_id or next(iter(session.pc.weapons.keys()))
    weapon = session.pc.weapons.get(weapon_id)
    if not weapon:
        raise HTTPException(status_code=400, detail="Unknown weapon")

    attack_total, attack_rolls, attack_bonus = attack_roll(session.pc, weapon)
    hit = attack_total >= session.enemy.armor_class
    damage_total = 0
    damage_rolls: List[int] = []
    damage_bonus = 0
    if hit:
        damage_total, damage_rolls, damage_bonus = roll_dice(weapon.damage)
        session.enemy.hp = max(0, session.enemy.hp - damage_total)
    log_entry = (
        f"{session.pc.name} attacks with {weapon.name} "
        f"({attack_total} vs AC {session.enemy.armor_class}) "
        f"{'hit' if hit else 'miss'}."
    )
    session.log.append(log_entry)
    if hit:
        session.log.append(
            f"Deals {damage_total} {weapon.damage_type} damage. "
            f"{session.enemy.name} HP: {session.enemy.hp}/{session.enemy.max_hp}."
        )
    narration = None
    if narrate:
        try:
            narration = await narrate_rules_event(session)
            if narration:
                session.story.append(narration)
        except httpx.HTTPError:
            narration = None
    persist_rules_sessions()
    sync_combat_state_from_rules(session)
    return AttackResponse(
        attacker="pc",
        target="enemy",
        attack_total=attack_total,
        attack_rolls=attack_rolls,
        attack_bonus=attack_bonus,
        hit=hit,
        damage_total=damage_total,
        damage_rolls=damage_rolls,
        damage_bonus=damage_bonus,
        damage_type=weapon.damage_type,
        target_hp=session.enemy.hp,
        attacker_name=session.pc.name,
        log=list(session.log),
        narration=narration,
    )

@app.post("/api/rules/sessions/{session_id}/enemy_turn", response_model=AttackResponse)
async def enemy_attack(session_id: str, narrate: bool = Query(False)):
    session = get_rules_session_or_404(session_id)
    if session.pc.hp <= 0 or session.enemy.hp <= 0:
        raise HTTPException(status_code=400, detail="Combat is already over")

    chosen = pick_enemy_action(session.enemy)
    attack_total: int = 0
    attack_rolls: List[int] = []
    attack_bonus: int = 0
    hit = False
    damage_total = 0
    damage_rolls: List[int] = []
    damage_bonus = 0
    damage_type = session.enemy.damage_type
    action_name = "attack"

    if chosen:
        action = chosen["action"]
        mechanics = chosen["mechanics"]
        action_name = action.get("name") or "attack"
        if mechanics.get("save"):
            save_ability = mechanics["save"]
            dc = mechanics.get("dc") or 10
            attack_total, attack_rolls, _ = roll_dice("1d20+0")
            attack_bonus = get_save_bonus(session.pc, save_ability)
            attack_total += attack_bonus
            saved = attack_total >= dc
            hit = not saved
            if mechanics.get("damage"):
                damage_total, damage_rolls, damage_bonus = roll_dice(mechanics["damage"])
                if saved:
                    damage_total = damage_total // 2 if mechanics.get("half_on_save") else 0
            if mechanics.get("damage_type"):
                damage_type = mechanics["damage_type"]
            session.log.append(
                f"{session.enemy.name} uses {action_name}. "
                f"{session.pc.name} makes a {save_ability.upper()} save "
                f"({attack_total} vs DC {dc}) {'success' if saved else 'fail'}."
            )
        else:
            attack_bonus = mechanics.get("attack_bonus") or session.enemy.attack_bonus
            attack_total, attack_rolls, _ = roll_dice("1d20+0")
            attack_total += attack_bonus
            hit = attack_total >= session.pc.armor_class
            damage_expr = mechanics.get("damage") or session.enemy.damage
            if hit and damage_expr:
                damage_total, damage_rolls, damage_bonus = roll_dice(damage_expr)
                if mechanics.get("damage_type"):
                    damage_type = mechanics["damage_type"]
            session.log.append(
                f"{session.enemy.name} uses {action_name} "
                f"({attack_total} vs AC {session.pc.armor_class}) "
                f"{'hit' if hit else 'miss'}."
            )
    else:
        attack_total, attack_rolls, attack_bonus = monster_attack_roll(session.enemy)
        hit = attack_total >= session.pc.armor_class
        if hit:
            damage_total, damage_rolls, damage_bonus = roll_dice(session.enemy.damage)
        session.log.append(
            f"{session.enemy.name} attacks "
            f"({attack_total} vs AC {session.pc.armor_class}) "
            f"{'hit' if hit else 'miss'}."
        )

    if hit and damage_total:
        session.pc.hp = max(0, session.pc.hp - damage_total)
        session.log.append(
            f"Deals {damage_total} {damage_type} damage. "
            f"{session.pc.name} HP: {session.pc.hp}/{session.pc.max_hp}."
        )
    session.round += 1
    narration = None
    if narrate:
        try:
            narration = await narrate_rules_event(session)
            if narration:
                session.story.append(narration)
        except httpx.HTTPError:
            narration = None
    persist_rules_sessions()
    sync_combat_state_from_rules(session)
    return AttackResponse(
        attacker="enemy",
        target="pc",
        attack_total=attack_total,
        attack_rolls=attack_rolls,
        attack_bonus=attack_bonus,
        hit=hit,
        damage_total=damage_total,
        damage_rolls=damage_rolls,
        damage_bonus=damage_bonus,
        damage_type=damage_type,
        target_hp=session.pc.hp,
        attacker_name=session.enemy.name,
        log=list(session.log),
        narration=narration,
    )

@app.post("/api/rules/sessions/{session_id}/skill_check", response_model=SkillCheckResponse)
async def skill_check(session_id: str, payload: SkillCheckRequest, narrate: bool = Query(False)):
    session = get_rules_session_or_404(session_id)
    ability = payload.ability
    label = (payload.ability or "").upper()
    if payload.skill:
        skill_key = payload.skill.strip().lower()
        ability = SKILL_TO_ABILITY.get(skill_key)
        label = payload.skill
    if payload.save:
        ability = payload.save
        label = f"{payload.save.upper()} save"
    if ability not in session.pc.stats:
        raise HTTPException(status_code=400, detail="Unknown ability")
    total, rolls, bonus = roll_dice("1d20+0")
    ability_bonus = (session.pc.stats[ability] - 10) // 2
    proficiency = 0
    if payload.save and ability in session.pc.save_proficiencies:
        proficiency = session.pc.prof_bonus
    if payload.skill:
        if payload.skill.strip().lower() in [s.lower() for s in session.pc.skill_proficiencies]:
            proficiency = session.pc.prof_bonus
    bonus += ability_bonus + proficiency
    total += ability_bonus + proficiency
    success = total >= payload.dc
    session.log.append(
        f"{session.pc.name} makes a {label} check "
        f"({total} vs DC {payload.dc}) {'success' if success else 'fail'}."
    )
    narration = None
    if narrate:
        try:
            narration = await narrate_rules_event(session)
            if narration:
                session.story.append(narration)
        except httpx.HTTPError:
            narration = None
    persist_rules_sessions()
    return SkillCheckResponse(total=total, rolls=rolls, bonus=bonus, success=success, narration=narration)

@app.post("/api/rules/sessions/{session_id}/dc", response_model=DCAssignResponse)
async def assign_dc(session_id: str, payload: DCAssignRequest):
    session = get_rules_session_or_404(session_id)
    label = payload.ability or ""
    if payload.skill:
        label = payload.skill
    if payload.save:
        label = f"{payload.save.upper()} save"
    context = (payload.context or "").strip()
    if not context:
        return DCAssignResponse(dc=15)
    dc = await assign_dc_from_ai(label, context)
    session.log.append(f"GM sets DC {dc} for {label or 'check'}.")
    persist_rules_sessions()
    return DCAssignResponse(dc=dc)

@app.post("/api/rules/sessions/{session_id}/cast", response_model=SpellCastResponse)
async def cast_spell(session_id: str, payload: SpellCastRequest, narrate: bool = Query(False)):
    session = get_rules_session_or_404(session_id)
    if session.pc.hp <= 0 or session.enemy.hp <= 0:
        raise HTTPException(status_code=400, detail="Combat is already over")

    requested_spell = payload.spell_id
    spell_id = requested_spell
    spell = spells_srd.get(spell_id)
    if not spell:
        spell_id = resolve_spell_id(requested_spell or "")
        spell = spells_srd.get(spell_id or "")
    if not spell:
        raise HTTPException(status_code=400, detail="Unknown spell")
    allowed_ids = set(session.pc.cantrips_known)
    allowed_ids.update(session.pc.known_spells)
    allowed_ids.update(session.pc.prepared_spells)
    if allowed_ids:
        allowed_norm = {normalize_spell_key(entry) for entry in allowed_ids}
        request_norm = normalize_spell_key(requested_spell)
        spell_id_norm = normalize_spell_key(spell_id)
        spell_name_norm = normalize_spell_key(spell.get("name") or "")
        if not (
            request_norm in allowed_norm
            or spell_id_norm in allowed_norm
            or spell_name_norm in allowed_norm
        ):
            raise HTTPException(status_code=400, detail="Spell not available to character")

    mechanics = parse_spell_mechanics(spell)
    ability_key = get_spellcasting_ability(session.pc)
    ability_bonus = ability_mod(session.pc.stats.get(ability_key, 10))
    dc = 8 + session.pc.prof_bonus + ability_bonus
    name = spell.get("name", spell_id)

    attack_total: Optional[int] = None
    attack_rolls: Optional[List[int]] = None
    attack_bonus: Optional[int] = None
    hit: Optional[bool] = None
    damage_total = 0
    damage_rolls: List[int] = []
    damage_bonus = 0
    damage_type = mechanics.get("damage_type")
    outcome = "casts"

    if mechanics.get("attack"):
        attack_total, attack_rolls, _ = roll_dice("1d20+0")
        attack_bonus = ability_bonus + session.pc.prof_bonus
        attack_total += attack_bonus
        hit = attack_total >= session.enemy.armor_class
        if hit and mechanics.get("damage"):
            damage_total, damage_rolls, damage_bonus = roll_dice(mechanics["damage"])
        outcome = "hit" if hit else "miss"
        session.log.append(
            f"{session.pc.name} casts {name} "
            f"({attack_total} vs AC {session.enemy.armor_class}) {outcome}."
        )
    elif mechanics.get("save"):
        save_ability = mechanics["save"]
        save_total, save_rolls, _ = roll_dice("1d20+0")
        save_bonus = get_monster_save_bonus(session.enemy, save_ability)
        save_total += save_bonus
        saved = save_total >= dc
        hit = not saved
        if mechanics.get("damage"):
            damage_total, damage_rolls, damage_bonus = roll_dice(mechanics["damage"])
            if saved:
                damage_total = damage_total // 2 if mechanics.get("half_on_save") else 0
        outcome = "fail" if hit else "save"
        attack_total = save_total
        attack_rolls = save_rolls
        attack_bonus = save_bonus
        session.log.append(
            f"{session.pc.name} casts {name}. {session.enemy.name} makes a "
            f"{save_ability.upper()} save ({save_total} vs DC {dc}) "
            f"{'fail' if hit else 'success'}."
        )
    else:
        if mechanics.get("damage"):
            damage_total, damage_rolls, damage_bonus = roll_dice(mechanics["damage"])
            hit = True
            outcome = "hit"
            session.log.append(f"{session.pc.name} casts {name}.")
        else:
            session.log.append(f"{session.pc.name} casts {name}.")

    apply_damage = bool(damage_total)
    if mechanics.get("save") and hit is False and not mechanics.get("half_on_save"):
        apply_damage = False
    if apply_damage:
        session.enemy.hp = max(0, session.enemy.hp - damage_total)
        session.log.append(
            f"Deals {damage_total} {damage_type or 'magic'} damage. "
            f"{session.enemy.name} HP: {session.enemy.hp}/{session.enemy.max_hp}."
        )

    narration = None
    if narrate:
        try:
            narration = await narrate_rules_event(session)
            if narration:
                session.story.append(narration)
        except httpx.HTTPError:
            narration = None
    persist_rules_sessions()
    sync_combat_state_from_rules(session)
    return SpellCastResponse(
        spell_id=spell_id,
        name=name,
        outcome=outcome,
        dc=dc if mechanics.get("save") else None,
        save=mechanics.get("save"),
        attack_total=attack_total,
        attack_rolls=attack_rolls,
        attack_bonus=attack_bonus,
        hit=hit,
        damage_total=damage_total,
        damage_rolls=damage_rolls,
        damage_bonus=damage_bonus,
        damage_type=damage_type,
        target_hp=session.enemy.hp,
        log=list(session.log),
        narration=narration,
    )

@app.post("/api/rules/sessions/{session_id}/initiative", response_model=InitiativeResponse)
async def initiative_roll(session_id: str):
    session = get_rules_session_or_404(session_id)
    total, rolls, bonus = roll_dice("1d20+0")
    bonus += ability_mod(session.pc.stats["dex"])
    total += bonus
    session.log.append(f"{session.pc.name} rolls initiative: {total}.")
    persist_rules_sessions()
    return InitiativeResponse(total=total, rolls=rolls, bonus=bonus)

