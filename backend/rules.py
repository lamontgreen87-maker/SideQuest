import random
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Weapon:
    name: str
    attack_ability: str
    damage: str
    damage_type: str
    finesse: bool = False


@dataclass
class Character:
    name: str
    klass: str
    level: int
    stats: Dict[str, int]
    prof_bonus: int
    armor_class: int
    max_hp: int
    hp: int
    weapons: Dict[str, Weapon]
    race: Optional[str] = None
    background: Optional[str] = None
    alignment: Optional[str] = None
    traits: List[str] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)
    spellcasting_ability: Optional[str] = None
    cantrips_known: List[str] = field(default_factory=list)
    spellbook: List[str] = field(default_factory=list)
    prepared_spells: List[str] = field(default_factory=list)
    known_spells: List[str] = field(default_factory=list)
    save_proficiencies: List[str] = field(default_factory=list)
    skill_proficiencies: List[str] = field(default_factory=list)
    conditions: List[str] = field(default_factory=list)
    items: List[str] = field(default_factory=list)


@dataclass
class Monster:
    name: str
    armor_class: int
    max_hp: int
    hp: int
    attack_bonus: int
    damage: str
    damage_type: str
    size: Optional[str] = None
    type: Optional[str] = None
    alignment: Optional[str] = None
    speed: Optional[str] = None
    senses: Optional[str] = None
    languages: Optional[str] = None
    cr: Optional[str] = None
    stats: Dict[str, int] = field(default_factory=dict)
    saves: Dict[str, int] = field(default_factory=dict)
    traits: List[Dict[str, Any]] = field(default_factory=list)
    actions: List[Dict[str, Any]] = field(default_factory=list)
    legendary_actions: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class RulesSession:
    session_id: str
    pc: Character
    enemy: Monster
    round: int
    story_session_id: Optional[str] = None
    log: List[str] = field(default_factory=list)
    story: List[str] = field(default_factory=list)


def serialize_character(pc: Character) -> Dict[str, object]:
    return {
        "name": pc.name,
        "class": pc.klass,
        "level": pc.level,
        "stats": dict(pc.stats),
        "prof_bonus": pc.prof_bonus,
        "armor_class": pc.armor_class,
        "max_hp": pc.max_hp,
        "hp": pc.hp,
        "weapons": {
            key: {
                "name": weapon.name,
                "attack_ability": weapon.attack_ability,
                "damage": weapon.damage,
                "damage_type": weapon.damage_type,
                "finesse": weapon.finesse,
            }
            for key, weapon in pc.weapons.items()
        },
        "race": pc.race,
        "background": pc.background,
        "alignment": pc.alignment,
        "traits": list(pc.traits),
        "languages": list(pc.languages),
        "spellcasting_ability": pc.spellcasting_ability,
        "cantrips_known": list(pc.cantrips_known),
        "spellbook": list(pc.spellbook),
        "prepared_spells": list(pc.prepared_spells),
        "known_spells": list(pc.known_spells),
        "save_proficiencies": list(pc.save_proficiencies),
        "skill_proficiencies": list(pc.skill_proficiencies),
        "conditions": list(pc.conditions),
        "items": list(pc.items),
    }


def serialize_monster(monster: Monster) -> Dict[str, object]:
    return {
        "name": monster.name,
        "armor_class": monster.armor_class,
        "max_hp": monster.max_hp,
        "hp": monster.hp,
        "attack_bonus": monster.attack_bonus,
        "damage": monster.damage,
        "damage_type": monster.damage_type,
        "size": monster.size,
        "type": monster.type,
        "alignment": monster.alignment,
        "speed": monster.speed,
        "senses": monster.senses,
        "languages": monster.languages,
        "cr": monster.cr,
        "stats": dict(monster.stats),
        "saves": dict(monster.saves),
        "traits": list(monster.traits),
        "actions": list(monster.actions),
        "legendary_actions": list(monster.legendary_actions),
    }


def serialize_rules_session(session: RulesSession) -> Dict[str, object]:
    return {
        "session_id": session.session_id,
        "pc": serialize_character(session.pc),
        "enemy": serialize_monster(session.enemy),
        "round": session.round,
        "story_session_id": session.story_session_id,
        "log": list(session.log),
        "story": list(session.story),
    }


def deserialize_rules_session(data: Dict[str, object]) -> RulesSession:
    pc_data = data["pc"]
    enemy_data = data["enemy"]
    pc = Character(
        name=pc_data["name"],
        klass=pc_data["class"],
        level=pc_data["level"],
        stats=dict(pc_data["stats"]),
        prof_bonus=pc_data["prof_bonus"],
        armor_class=pc_data["armor_class"],
        max_hp=pc_data["max_hp"],
        hp=pc_data["hp"],
        weapons={
            key: Weapon(
                name=value["name"],
                attack_ability=value["attack_ability"],
                damage=value["damage"],
                damage_type=value["damage_type"],
                finesse=bool(value.get("finesse", False)),
            )
            for key, value in pc_data["weapons"].items()
        },
        race=pc_data.get("race"),
        background=pc_data.get("background"),
        alignment=pc_data.get("alignment"),
        traits=list(pc_data.get("traits", [])),
        languages=list(pc_data.get("languages", [])),
        spellcasting_ability=pc_data.get("spellcasting_ability"),
        cantrips_known=list(pc_data.get("cantrips_known", [])),
        spellbook=list(pc_data.get("spellbook", [])),
        prepared_spells=list(pc_data.get("prepared_spells", [])),
        known_spells=list(pc_data.get("known_spells", [])),
        save_proficiencies=list(pc_data.get("save_proficiencies", [])),
        skill_proficiencies=list(pc_data.get("skill_proficiencies", [])),
        conditions=list(pc_data.get("conditions", [])),
        items=list(pc_data.get("items", [])),
    )
    enemy = Monster(
        name=enemy_data["name"],
        armor_class=enemy_data["armor_class"],
        max_hp=enemy_data["max_hp"],
        hp=enemy_data["hp"],
        attack_bonus=enemy_data["attack_bonus"],
        damage=enemy_data["damage"],
        damage_type=enemy_data["damage_type"],
        size=enemy_data.get("size"),
        type=enemy_data.get("type"),
        alignment=enemy_data.get("alignment"),
        speed=enemy_data.get("speed"),
        senses=enemy_data.get("senses"),
        languages=enemy_data.get("languages"),
        cr=enemy_data.get("cr"),
        stats=dict(enemy_data.get("stats", {})),
        saves=dict(enemy_data.get("saves", {})),
        traits=list(enemy_data.get("traits", [])),
        actions=list(enemy_data.get("actions", [])),
        legendary_actions=list(enemy_data.get("legendary_actions", [])),
    )
    return RulesSession(
        session_id=data["session_id"],
        pc=pc,
        enemy=enemy,
        round=int(data["round"]),
        story_session_id=data.get("story_session_id"),
        log=list(data.get("log", [])),
        story=list(data.get("story", [])),
    )


PREMADE_SHEETS: Dict[str, Character] = {
    "fighter_srd": Character(
        name="Aric",
        klass="Fighter",
        level=3,
        stats={
            "str": 16,
            "dex": 13,
            "con": 14,
            "int": 10,
            "wis": 12,
            "cha": 8,
        },
        prof_bonus=2,
        armor_class=16,
        max_hp=28,
        hp=28,
        weapons={
            "longsword": Weapon(
                name="Longsword",
                attack_ability="str",
                damage="1d8+3",
                damage_type="slashing",
            ),
            "longbow": Weapon(
                name="Longbow",
                attack_ability="dex",
                damage="1d8+1",
                damage_type="piercing",
            ),
        },
        save_proficiencies=["str", "con"],
    ),
    "rogue_srd": Character(
        name="Nyx",
        klass="Rogue",
        level=3,
        stats={
            "str": 10,
            "dex": 16,
            "con": 12,
            "int": 13,
            "wis": 10,
            "cha": 14,
        },
        prof_bonus=2,
        armor_class=14,
        max_hp=21,
        hp=21,
        weapons={
            "rapier": Weapon(
                name="Rapier",
                attack_ability="dex",
                damage="1d8+3",
                damage_type="piercing",
                finesse=True,
            ),
            "shortbow": Weapon(
                name="Shortbow",
                attack_ability="dex",
                damage="1d6+3",
                damage_type="piercing",
            ),
        },
        save_proficiencies=["dex", "int"],
    ),
    "cleric_srd": Character(
        name="Mira",
        klass="Cleric",
        level=3,
        stats={
            "str": 14,
            "dex": 10,
            "con": 14,
            "int": 10,
            "wis": 16,
            "cha": 12,
        },
        prof_bonus=2,
        armor_class=17,
        max_hp=24,
        hp=24,
        weapons={
            "mace": Weapon(
                name="Mace",
                attack_ability="str",
                damage="1d6+2",
                damage_type="bludgeoning",
            )
        },
        save_proficiencies=["wis", "cha"],
    ),
}

MONSTERS: Dict[str, Monster] = {
    "goblin": Monster(
        name="Goblin",
        armor_class=15,
        max_hp=7,
        hp=7,
        attack_bonus=4,
        damage="1d6+2",
        damage_type="slashing",
    ),
    "orc": Monster(
        name="Orc",
        armor_class=13,
        max_hp=15,
        hp=15,
        attack_bonus=5,
        damage="1d12+3",
        damage_type="slashing",
    ),
}


def ability_mod(score: int) -> int:
    return (score - 10) // 2


def parse_dice(expr: str) -> Tuple[int, int, int]:
    match = re.fullmatch(r"(\d+)d(\d+)([+-]\d+)?", expr.strip())
    if not match:
        raise ValueError(f"Invalid dice expression: {expr}")
    count = int(match.group(1))
    sides = int(match.group(2))
    bonus = int(match.group(3) or 0)
    return count, sides, bonus


def roll_dice(expr: str) -> Tuple[int, List[int], int]:
    count, sides, bonus = parse_dice(expr)
    rolls = [random.randint(1, sides) for _ in range(count)]
    total = sum(rolls) + bonus
    return total, rolls, bonus


def attack_roll(attacker: Character, weapon: Weapon) -> Tuple[int, List[int], int]:
    stat_mod = ability_mod(attacker.stats[weapon.attack_ability])
    total, rolls, _ = roll_dice("1d20+0")
    total += stat_mod + attacker.prof_bonus
    return total, rolls, stat_mod + attacker.prof_bonus


def monster_attack_roll(monster: Monster) -> Tuple[int, List[int], int]:
    total, rolls, _ = roll_dice("1d20+0")
    total += monster.attack_bonus
    return total, rolls, monster.attack_bonus


def reset_character(pc: Character) -> Character:
    return Character(
        name=pc.name,
        klass=pc.klass,
        level=pc.level,
        stats=dict(pc.stats),
        prof_bonus=pc.prof_bonus,
        armor_class=pc.armor_class,
        max_hp=pc.max_hp,
        hp=pc.max_hp,
        weapons=dict(pc.weapons),
        race=pc.race,
        background=pc.background,
        alignment=pc.alignment,
        traits=list(pc.traits),
        languages=list(pc.languages),
        spellcasting_ability=pc.spellcasting_ability,
        cantrips_known=list(pc.cantrips_known),
        spellbook=list(pc.spellbook),
        prepared_spells=list(pc.prepared_spells),
        known_spells=list(pc.known_spells),
        save_proficiencies=list(pc.save_proficiencies),
        skill_proficiencies=list(pc.skill_proficiencies),
        conditions=list(pc.conditions),
        items=list(pc.items),
    )


def reset_monster(monster: Monster) -> Monster:
    return Monster(
        name=monster.name,
        armor_class=monster.armor_class,
        max_hp=monster.max_hp,
        hp=monster.max_hp,
        attack_bonus=monster.attack_bonus,
        damage=monster.damage,
        damage_type=monster.damage_type,
        size=monster.size,
        type=monster.type,
        alignment=monster.alignment,
        speed=monster.speed,
        senses=monster.senses,
        languages=monster.languages,
        cr=monster.cr,
        stats=dict(monster.stats),
        saves=dict(monster.saves),
        traits=list(monster.traits),
        actions=list(monster.actions),
        legendary_actions=list(monster.legendary_actions),
    )
