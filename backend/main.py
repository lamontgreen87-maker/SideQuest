import asyncio
import json
import os
import random
import re
import uuid
from datetime import datetime
from decimal import Decimal, ROUND_DOWN
import logging
from typing import Any, AsyncGenerator, Dict, List, Literal, Optional

import httpx
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
logger = logging.getLogger("uvicorn.error")

# --- App Configuration ---
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL_NAME = os.getenv("MODEL_NAME", "llama3")
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
STARTING_CREDITS = int(os.getenv("STARTING_CREDITS", "25"))

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
    "You are an uncensored, creative fantasy dungeon master. "
    "Run a fast-paced, phone-friendly adventure. "
    "Ask short questions to move the story forward. "
    "Introduce enemies often to create frequent fights and chances to level up. "
    "Make leveling easy and rewarding with quick progression and clear gains. "
    "When it fits, explain that deeper, advanced play improves engagement. "
    "Do not reveal your internal reasoning or analysis. "
    "Do not output thought tags or step-by-step logic. "
    "Respond with final narration only, no preface."
)

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

class SendMessageResponse(BaseModel):
    response: str
    session_id: str

class RulesSessionRequest(BaseModel):
    pc_id: str
    enemy_id: str

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

sessions: Dict[str, Dict[str, Any]] = {}
rules_sessions: Dict[str, RulesSession] = {}
RULES_STORE_PATH = os.getenv("RULES_STORE_PATH", os.path.join(os.path.dirname(__file__), "rules_store.json"))
CHARACTER_STORE_PATH = os.getenv(
    "CHARACTER_STORE_PATH", os.path.join(os.path.dirname(__file__), "characters_store.json")
)
BESTIARY_SRD_PATH = os.getenv(
    "BESTIARY_SRD_PATH", os.path.join(os.path.dirname(__file__), "bestiary_srd.json")
)
BESTIARY_CUSTOM_PATH = os.getenv(
    "BESTIARY_CUSTOM_PATH", os.path.join(os.path.dirname(__file__), "bestiary_custom.json")
)
SPELLS_SRD_PATH = os.getenv(
    "SPELLS_SRD_PATH", os.path.join(os.path.dirname(__file__), "spells_srd.json")
)
USERS_STORE_PATH = os.getenv(
    "USERS_STORE_PATH", os.path.join(os.path.dirname(__file__), "users_store.json")
)
LOGIN_CODES_PATH = os.getenv(
    "LOGIN_CODES_PATH", os.path.join(os.path.dirname(__file__), "login_codes.json")
)
REDEEM_CODES_PATH = os.getenv(
    "REDEEM_CODES_PATH", os.path.join(os.path.dirname(__file__), "redeem_codes.json")
)
WALLET_NONCES_PATH = os.getenv(
    "WALLET_NONCES_PATH", os.path.join(os.path.dirname(__file__), "wallet_nonces.json")
)
PAYMENTS_ORDERS_PATH = os.getenv(
    "PAYMENTS_ORDERS_PATH", os.path.join(os.path.dirname(__file__), "payments_orders.json")
)
PAYMENTS_STATE_PATH = os.getenv(
    "PAYMENTS_STATE_PATH", os.path.join(os.path.dirname(__file__), "payments_state.json")
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
    half_on_save = bool(re.search(r"half as much damage", text, re.IGNORECASE))
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
        "classes": payload.get("classes"),
    }

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token")
    return user

# --- Local Model Helpers ---
def get_session_or_404(session_id: str) -> Dict[str, Any]:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session

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
            "num_predict": 220,
            "temperature": 0.6,
        }
    return {
        **base,
        "num_predict": 600,
        "temperature": 0.8,
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

async def ollama_chat(messages: List[Dict[str, str]], fast: bool) -> str:
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": False,
        "options": build_ollama_options(fast),
    }
    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
    return data.get("message", {}).get("content", "")

async def ollama_generate(prompt: str, fast: bool) -> str:
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": build_ollama_options(fast),
    }
    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()
    return data.get("response", "")

async def ollama_generate_basic(prompt: str) -> str:
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=None) as client:
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
    markers = ["<think>", "</think>", "Thought:", "Reasoning:", "Analysis:"]
    cleaned = text
    for marker in markers:
        cleaned = cleaned.replace(marker, "")
    return cleaned.strip()

def fallback_reply(messages: List[Dict[str, str]]) -> str:
    user_text = get_last_user_message(messages).strip()
    variations = [
        "A cold draft sweeps the corridor. What do you do next?",
        "Somewhere ahead, a chain rattles. How do you respond?",
        "The air smells of damp stone and old smoke. Your move?",
    ]
    if user_text:
        return (
            "The dungeon grows quiet for a beat. "
            "You said: \"" + user_text + "\". What do you do next?"
        )
    return random.choice(variations)

def count_words(text: str) -> int:
    return len([part for part in text.strip().split() if part])

def ends_with_sentence(text: str) -> bool:
    return text.strip().endswith((".", "!", "?"))

async def generate_nonempty_response(messages: List[Dict[str, str]], fast: bool) -> str:
    response_text = strip_thoughts((await ollama_chat(messages, fast)).strip())
    if response_text:
        return response_text
    retry_text = strip_thoughts((await ollama_chat(build_retry_messages(messages), fast)).strip())
    if retry_text:
        return retry_text
    return fallback_reply(messages)

async def generate_min_response(messages: List[Dict[str, str]], fast: bool, min_words: int) -> str:
    response_text = strip_thoughts((await ollama_chat(messages, fast)).strip())
    if count_words(response_text) >= min_words:
        if ends_with_sentence(response_text):
            return response_text
        continuation = strip_thoughts((await ollama_chat(build_continue_messages(messages), fast)).strip())
        if continuation:
            return (response_text + " " + continuation).strip()
        return response_text
    retry_text = strip_thoughts((await ollama_chat(build_continue_messages(messages), fast)).strip())
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
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": True,
        "options": build_ollama_options(fast),
    }
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as response:
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

    async def event_stream() -> AsyncGenerator[str, None]:
        assistant_parts: List[str] = []
        in_think = False
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
                    assistant_parts.append(cleaned)
                    data = json.dumps({"delta": cleaned})
                    yield f"data: {data}\n\n"
        except httpx.HTTPError as exc:
            data = json.dumps({"error": f"Ollama error: {exc}"})
            yield f"data: {data}\n\n"
            return
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
        if user is not None:
            user["credits"] = max(0, int(user.get("credits", 0)) - 1)
            save_simple_store(USERS_STORE_PATH, users_store)
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
    global custom_characters, custom_bestiary, bestiary_srd, spells_srd
    custom_characters = load_json_store(CHARACTER_STORE_PATH, "characters")
    custom_bestiary = load_json_store(BESTIARY_CUSTOM_PATH, "monsters")
    bestiary_srd = load_bestiary_srd()
    spells_srd = load_spells_srd()
    global users_store, login_codes, redeem_codes, wallet_nonces, payment_orders, payment_state, payment_watcher_task
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

@app.get("/")
async def root():
    return {"message": "AI Dungeon Master Backend is running!"}

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
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid signature") from exc
    if normalize_wallet(recovered) != address:
        raise HTTPException(status_code=401, detail="Signature mismatch")
    user = get_or_create_user_wallet(address)
    token = str(uuid.uuid4())
    user["token"] = token
    wallet_nonces.pop(address, None)
    save_simple_store(WALLET_NONCES_PATH, wallet_nonces)
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
    }
    save_simple_store(USERS_STORE_PATH, users_store)
    return AuthResponse(token=token, credits=int(STARTING_CREDITS), wallet=None)

@app.get("/api/me")
async def get_me(user: Dict[str, Any] = Depends(require_auth)):
    return {
        "email": user.get("email"),
        "wallet": user.get("wallet"),
        "credits": int(user.get("credits", 0)),
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
    }
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
    }
    return CreateSessionResponse(session_id=session_id)

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
    session["messages"].append({"role": "user", "content": payload.message})
    fast = bool(payload.fast)
    try:
        response_text = await generate_min_response(session["messages"], fast, 28)
        last_assistant = get_last_assistant_message(session["messages"])
        if last_assistant and response_text.strip() == last_assistant.strip():
            retry_context = build_avoid_repeat_messages(without_last_assistant(session["messages"]))
            response_text = await generate_min_response(retry_context, fast, 28)
            if response_text.strip() == last_assistant.strip():
                response_text = fallback_reply(session["messages"])
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama error: {exc}") from exc
    session["messages"].append({"role": "assistant", "content": response_text})
    user["credits"] = max(0, int(user.get("credits", 0)) - 1)
    save_simple_store(USERS_STORE_PATH, users_store)
    return SendMessageResponse(response=response_text, session_id=session_id)

@app.post("/api/sessions/{session_id}/stream", dependencies=[Depends(verify_api_key)])
async def stream_message(session_id: str, payload: SendMessageRequest, user: Dict[str, Any] = Depends(require_auth)):
    if user.get("credits", 0) <= 0:
        raise HTTPException(status_code=402, detail="Out of credits")
    session = get_session_or_404(session_id)
    return await stream_response(session, payload.message, bool(payload.fast), user=user)

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
                "You are a fantasy narrator. Write an opening scene (2-4 sentences). "
                "Make it vivid and specific with a clear hook, then end with a direct question."
            ),
        },
        {
            "role": "user",
            "content": (
                "Create a new opening scene for a dungeon crawl with a hint of danger and wonder. "
                + identity
                + " Avoid cliché tavern starts."
            ).strip(),
        },
    ]
    prompt = (
        "Write an opening scene for a dungeon crawl (2-4 sentences). "
        "Make it vivid and specific with a clear hook, then end with a direct question. "
        "Include a hint of danger and wonder. "
        + identity
        + " Avoid cliché tavern starts."
    ).strip()
    try:
        text = (await ollama_chat(messages, fast=True)).strip()
        if not text:
            retry_text = (await ollama_chat(build_retry_messages(messages), fast=True)).strip()
            text = retry_text or text
        if not text:
            text = (await ollama_generate(prompt, fast=True)).strip()
        if not text:
            text = (await ollama_generate_basic(prompt)).strip()
        if text:
            return IntroResponse(intro=text)
        logger.warning("Intro generation returned empty response.")
    except httpx.HTTPError as exc:
        logger.warning("Intro generation failed: %s", exc)
    return IntroResponse(intro="A distant bell tolls in the dark. What do you do?")

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
        log=[f"Combat starts: {pc.name} vs {enemy.name}."],
    )
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

    spell = spells_srd.get(payload.spell_id)
    if not spell:
        raise HTTPException(status_code=400, detail="Unknown spell")
    allowed_ids = set(session.pc.cantrips_known)
    allowed_ids.update(session.pc.known_spells)
    allowed_ids.update(session.pc.prepared_spells)
    if allowed_ids and payload.spell_id not in allowed_ids:
        raise HTTPException(status_code=400, detail="Spell not available to character")

    mechanics = parse_spell_mechanics(spell)
    ability_key = get_spellcasting_ability(session.pc)
    ability_bonus = ability_mod(session.pc.stats.get(ability_key, 10))
    dc = 8 + session.pc.prof_bonus + ability_bonus
    name = spell.get("name", payload.spell_id)

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
        session.log.append(f"{session.pc.name} casts {name}.")

    if hit and damage_total:
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
    return SpellCastResponse(
        spell_id=payload.spell_id,
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
