# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DSTP** — Don't Starve Together Panel. A web-based admin panel for DST servers. Consists of a DST Lua mod (HTTP polling bridge) and a FluxStack full-stack app (Bun + Elysia + React).

## Architecture

Two separate codebases in one repo:

### DST Mod (Lua)
- `modinfo.lua` — mod config with 13 options (server ID, backend URL, poll interval, 10 event categories)
- `modmain.lua` ��� entry point + private message system via `net_string`/`net_event` on `player_classified`
- `scripts/dstp/client.lua` — ~1100 lines, the HTTP bridge. Polling, commands, event capture, debounce

Key constraints:
- DST Lua sandbox: no sockets, no FFI, no threads. Only HTTP via `TheSim:QueryServer(url, callback, method, body)`
- `GLOBAL` is only available in `modmain.lua` scope — modules loaded via `require()` must receive it via Init()
- DST uses **strict mode** — all variables must be declared before use
- `local function` in Lua is only visible AFTER the declaration line — order matters
- Closures referencing locals declared later work at runtime (captured by reference) but NOT at module load time

### FluxStack Frontend (TypeScript)
- `frontend/` — FluxStack app created with `bunx create-fluxstack`
- Runtime: Bun + Elysia (backend) + React 19 + Vite (frontend)
- Live Components for real-time server↔client sync via WebSocket
- SQLite via `bun:sqlite` + Drizzle ORM, one DB file per DST server in `data/`

Key files:
- `app/server/live/LiveDSTP.ts` — singleton Live Component, flat state keys for efficient STATE_DELTA
- `app/server/live/LiveAutomation.ts` — flow engine with async execution context
- `app/server/services/DSTStateStore.ts` — in-memory cache, persists via `globalThis` across HMR
- `app/server/routes/dst.routes.ts` — POST /api/dst/sync (game calls this)
- `app/server/db/` — Drizzle schema, connection, repositories
- `app/client/src/live/DSTPanel.tsx` — main admin panel UI
- `app/client/src/automation/` — React Flow editor, node components, type system

## Commands

```bash
# Development
cd frontend && bun run dev          # Start full-stack dev server (port 3000)

# TypeScript
cd frontend && bunx tsc --noEmit    # Type check

# Database
cd frontend && bun run db:generate  # Generate migration from schema changes
cd frontend && bun run db:studio    # Open Drizzle Studio

# Lua syntax check (needs luaparse)
bun add -d luaparse && bun -e "require('luaparse').parse(require('fs').readFileSync('scripts/dstp/client.lua','utf8'),{luaVersion:'5.1'})"

# Copy mod to DST
cp scripts/dstp/client.lua "E:/SteamLibrary/steamapps/common/Don't Starve Together/mods/DSTP/scripts/dstp/"
cp modinfo.lua modmain.lua "E:/SteamLibrary/steamapps/common/Don't Starve Together/mods/DSTP/"
```

## Key Design Patterns

### Bidirectional Communication
Game POSTs state → backend responds with commands. One HTTP cycle = both directions. No WebSocket needed from game side.

### Flat State Keys (LiveDSTP)
Instead of `{ servers: [...] }` (causes full array replacement), state uses flat keys: `server:server-1`, `players:server-1`. The Live Component proxy only emits STATE_DELTA for changed keys.

### Event Categories + Hot-Toggle
Events are grouped into categories (players, chat, world, combat, etc). Categories can be enabled/disabled at runtime from the panel — the backend sends `enable_events` in the sync response, and the Lua client registers listeners dynamically.

### Execution Context (Automation)
Flows use an n8n-style context. Each node registers output: `context[node_id] = { ... }`. Downstream nodes resolve `{{node_id.field}}` via `resolveValue()`. Single `{{...}}` returns raw value (preserves types). String with mixed content does string interpolation.

### Auto-Detected Event Schemas
When unknown events arrive, `EventSchemaRepository.autoDetect()` infers field types from the data and stores in SQLite. Admin can refine via `saveEventSchema()`.

## Multi-Shard
Each DST server has 1-2 shards: master (overworld) and caves. The mod sends `shard_id = "server-1:master"` or `"server-1:caves"`. Backend groups by `server_id`, frontend shows tabs.

## Branches
- `main` — stable releases
- `feature/automation-flows` — current development (React Flow, execution context, Script node)

## Important Notes
- `executeScript` in LiveAutomation uses `new Function()` — runs arbitrary JS with full server access. Admin-only feature by design.
- `VisitURL` in modmain.lua only auto-opens URLs matching the configured `BACKEND_URL` (security).
- DST `Announce` is global — no native private messaging. We built one via `net_string` on `player_classified`.
- Character avatars are static PNGs from DST Wiki in `frontend/app/client/public/avatars/`.
- DST server logs: `%USERPROFILE%/Documents/Klei/DoNotStarveTogether/{steam_id}/Cluster_*/Master/server_log.txt`
