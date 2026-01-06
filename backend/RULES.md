# Strict SRD Rules

This backend includes a strict 5e SRD rules engine for single-player combat.
The rules are enforced in code; the model only narrates outcomes.

## Quick Start

Start the backend:

```powershell
cd "C:\Users\Lamont\Desktop\dungeon crawler\backend"
.\venv\Scripts\activate
$env:MODEL_NAME="qwen3:8b"
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Premades and Monsters

List premade characters:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/rules/premades
```

List monsters:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/rules/monsters
```

## Create a Rules Session

```powershell
$body = '{"pc_id":"fighter_srd","enemy_id":"goblin"}'
Invoke-WebRequest -UseBasicParsing -Method POST -ContentType "application/json" -Body $body http://127.0.0.1:8000/api/rules/sessions
```

## Player Attack

```powershell
$attack = '{"weapon_id":"longsword"}'
Invoke-WebRequest -UseBasicParsing -Method POST -ContentType "application/json" -Body $attack http://127.0.0.1:8000/api/rules/sessions/<SESSION_ID>/attack
```

Narrated attack (strict outcome, model narration only):

```powershell
Invoke-WebRequest -UseBasicParsing -Method POST -ContentType "application/json" -Body $attack "http://127.0.0.1:8000/api/rules/sessions/<SESSION_ID>/attack?narrate=true"
```

## Enemy Turn

```powershell
Invoke-WebRequest -UseBasicParsing -Method POST http://127.0.0.1:8000/api/rules/sessions/<SESSION_ID>/enemy_turn
```

## Skill Check

```powershell
$check = '{"ability":"str","dc":14}'
Invoke-WebRequest -UseBasicParsing -Method POST -ContentType "application/json" -Body $check http://127.0.0.1:8000/api/rules/sessions/<SESSION_ID>/skill_check
```

## Session State

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/rules/sessions/<SESSION_ID>
```

## Persistence

Rules sessions are persisted to `backend/rules_store.json` and reloaded on server
startup. If you want a different path, set `RULES_STORE_PATH`.
