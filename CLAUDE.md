# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DSTP** — Don't Starve Together Panel. A web-based admin panel for DST servers with visual flow automation. Consists of a DST Lua mod (HTTP polling bridge) and a FluxStack full-stack app (Bun + Elysia + React).

**Scope note:** DSTP is a control/automation panel — NOT a mod compiler. Flows run on the backend and send commands to the DST server. We do NOT compile flows into Lua scripts.

**Sandbox constraint:** DST's Lua `TheSim:QueryServer` has a hardcoded whitelist that only allows `127.0.0.1` and `localhost`. This was confirmed by Klei in their 2025 mod API thread. There is NO bypass via Lua, modinfo, DNS trick, or Workshop signing — the check is a textual string match on the URL before DNS resolution. To host DSTP centrally (one backend for many DST servers), each DST host must run `relay/` (a tiny Bun HTTP forwarder) on their machine that listens on 127.0.0.1 and proxies to the central backend. See `relay/README.md`.

## Architecture

```
DST Client          DST Server (Cluster)      Backend (Bun)      Admin Panel (React)
    │                      │                       │                    │
    │← net_string ─────────│                       │                    │
    │  (PM / UI widgets)   │                       │                    │
    │                      │─ POST /dst/sync ─────→│                    │
    │                      │  (state + events)     │                    │
    │                      │← {commands,           │                    │
    │                      │   enable_events} ─────│                    │
    │─ RPC UICallback ────→│                       │                    │
    │                      │                       │← WebSocket ────────│
    │                      │                       │─ STATE_DELTA ─────→│
```

Two separate codebases in one repo:

### DST Mod (Lua)
- `modinfo.lua` — mod config with event categories + server settings
- `modmain.lua` — entry point, `net_string` channels on `player_classified` (_dstp_pm, _dstp_ui), Tab scoreboard button, lazy-loading UIWidgets
- `scripts/dstp/client.lua` — HTTP bridge (~1400 lines). Polling, 40+ commands, event listeners, debounce
- `scripts/dstp/ui_widgets.lua` — client-side widget renderer (notification/label/panel/button/progress_bar)

Key constraints:
- DST Lua sandbox: no sockets, no FFI, no threads. Only HTTP via `TheSim:QueryServer(url, callback, method, body)`
- `GLOBAL` only available in `modmain.lua` scope — modules loaded via `require()` must receive it via Init()
- DST uses **strict mode** — all variables must be declared before use
- `local function` in Lua is only visible AFTER the declaration line — order matters. Use forward declarations at module top
- Client-side: `pcall` blocked in mod env, use `GLOBAL.pcall`
- Client-side: entities have `replica`, NOT `components` (only server has components)

### FluxStack Frontend (TypeScript)
- `frontend/` — FluxStack app (Bun + Elysia + React 19 + Vite)
- Live Components for real-time server↔client sync via WebSocket
- SQLite via `bun:sqlite` + Drizzle ORM, one DB file per DST server in `data/`

Key files:
- `app/server/live/LiveDSTP.ts` — singleton Live Component, flat state keys for efficient STATE_DELTA
- `app/server/live/LiveAutomation.ts` — flow engine with stateful execution, Wait/Merge support
- `app/server/live/FlowAnalyzer.ts` — graph analysis: simple vs stateful flows, trigger→wait mapping
- `app/server/live/WorkflowInstanceStore.ts` — pending Wait node instances (on globalThis, survives HMR)
- `app/server/services/DSTStateStore.ts` — in-memory cache (players, shards, command queues)
- `app/server/routes/dst.routes.ts` — POST /api/dst/sync (DST game calls this)
- `app/server/db/` — Drizzle schema, repositories (FlowRepository, AutomationLogRepository, FlowMemoryRepository, etc)
- `app/client/src/live/DSTPanel.tsx` — main admin panel UI
- `app/client/src/automation/` — React Flow editor, 11 node types, NodeDetailPanel modal

## Commands

```bash
# Development
cd frontend && bun run dev          # Start full-stack dev server (port 3000)

# TypeScript
cd frontend && bunx tsc --noEmit    # Type check

# Database
cd frontend && bun run db:generate  # Generate migration from schema changes
cd frontend && bun run db:studio    # Open Drizzle Studio

# Lua syntax check
bun -e "require('luaparse').parse(require('fs').readFileSync('scripts/dstp/client.lua','utf8'),{luaVersion:'5.1'})"

# Copy mod to DST (do this after any Lua change)
cp scripts/dstp/client.lua scripts/dstp/ui_widgets.lua "E:/SteamLibrary/steamapps/common/Don't Starve Together/mods/DSTP/scripts/dstp/"
cp modinfo.lua modmain.lua "E:/SteamLibrary/steamapps/common/Don't Starve Together/mods/DSTP/"
```

## Node Types (11)

| Node | Purpose |
|------|---------|
| `trigger` | Event-based entry point (40+ DST events across 11 categories) |
| `condition` | Binary branch (true/false), 6 operators |
| `action` | Game action (respawn, heal, kick, tp, spawn_prefab, etc — 30+ types) |
| `delay` | Wait N ms before continuing |
| `http_request` | External HTTP call (GET/POST with templates) |
| `set_variable` | Store custom key-value in context |
| `script` | JavaScript via `new Function()` (admin-only, runs in Node) |
| `get_player` | Fetch player data by userid (health, hunger, sanity, position, inventory) |
| `find_player` | Search player by name (partial, strips command prefixes like `/tp`, `#tp`) |
| `memory` | Persistent key-value per flow (SQLite) |
| `wait` | Multi-trigger merge: waits for N branches, 3 correlation modes, timeout support |

All nodes support `alias` for friendly context keys (`{{myAlias.field}}` instead of `{{node_id.field}}`).

## Event Categories

Events are grouped and hot-toggleable at runtime. Backend auto-activates categories needed by enabled flows.

- **players**: player_spawn, player_left, player_death, player_ghost, player_respawn
- **chat**: chat_message
- **combat**: player_kill, player_attacked
- **crafting**: player_craft, player_build
- **inventory**: player_equip, player_unequip, player_pickup, player_drop
- **health**: health_delta, hunger_delta, sanity_delta (debounced)
- **survival**: player_eat, insane/sane, starving/fed, freezing/warm, overheating/cooled, mounted/dismounted
- **gathering**: player_work, resource_gathered, player_harvest, player_startfire
- **world**: new_day, phase_changed, season_changed
- **weather**: storm_changed, precipitation, lightning_strike
- **bosses**: boss_event, boss_killed, fire_started

## UI Widgets In-Game

Backend flows can create UI in the DST client via `ui_*` actions. Delivered per-player via `net_string` on `player_classified._dstp_ui`:

- **notification** — toast at top, auto-dismiss with slide-in
- **label** — persistent HUD text with 11 anchor positions
- **panel** — modal window with title, body, close button
- **button** — clickable, sends RPC back as `ui_callback` event
- **progress_bar** — horizontal bar with label and color

All widgets have IDs for update/destroy. Commands are batched per frame via `DoTaskInTime(0)`.

## Key Design Patterns

### Bidirectional Communication
Game POSTs state → backend responds with commands in same response. One HTTP cycle = both directions. No WebSocket needed from game side.

### Flat State Keys (LiveDSTP)
State uses flat keys like `server:server-1`, `players:server-1` instead of nested arrays. The Live Component proxy only emits STATE_DELTA for changed keys. Also used by LiveAutomation for `flows:${serverId}`, `logs:${serverId}`, `capture:${serverId}`.

### Execution Context (Automation)
Flows use an n8n-style context. Each node writes output: `context[node_id] = {...}`. Downstream nodes resolve `{{node_id.field}}` or `{{alias.field}}` via `resolveValue()`. Single `{{...}}` returns raw value (preserves types). String with mixed content does string interpolation.

### Wait/Merge Execution
Flows with Wait nodes use `executeStatefulBranch` (via FlowAnalyzer detection). Each trigger starts a branch that walks to the Wait node, records arrival in WorkflowInstanceStore, and pauses. When all required branches arrive (or `any` mode satisfied), downstream continues. Hard TTL of 1 hour on instances prevents memory leaks.

### Auto-Activation of Event Categories
`ensureEventCategories` scans enabled flows every 30s and activates needed categories via `requestEventToggleForServer`. No manual toggling needed — save a flow with `player_hit` trigger and combat events auto-activate.

### Capture Mode (Debug)
Start/Stop capture from flow editor. Next execution records full trace (input context + output per node). Traces appear in NodeDetailPanel when double-clicking a node. Auto-stops after 5 min or 200 entries.

## Multi-Shard
Each DST server has 1-2 shards: master (overworld) and caves. The mod sends `shard_id = "server-1:master"` or `"server-1:caves"`. Backend groups by `server_id`, frontend shows tabs. Server ID auto-generated from `TheWorld.meta.session_identifier`.

## Branches
- `main` — stable releases
- `feature/automation-flows` — current development

## Important Notes

### Security
- `executeScript` in LiveAutomation uses `new Function()` — runs arbitrary JS with full server access. **Admin-only feature by design.**
- `VisitURL` in modmain.lua only auto-opens URLs matching the configured `BACKEND_URL`.
- No authentication on `/api/dst/sync` — trusted local network only (the DST mod posts here).
- The **admin panel** is gated by per-server auth: a password (hashed in `panel_auth`) plus cookie sessions, authorized per `server_id`. Setup token is announced per server on first `/dst/sync`. In-game magic links (`/panel-auth/issue-link`) let an admin grant access from chat. See `PanelAuthStore.ts`.

### DST-Specific
- DST `Announce` is global. Private messaging built via `net_string` on `player_classified` (channel `dstp.pm`).
- DST chat converts `/` to `#` — use `#tp nome` to test chat triggers. `find_player` node strips `#/!.` prefixes automatically.
- DST server logs: `%USERPROFILE%/Documents/Klei/DoNotStarveTogether/{steam_id}/Cluster_*/Master/server_log.txt`
- DST client logs: `%USERPROFILE%/Documents/Klei/DoNotStarveTogether/client_log.txt`
- DST doesn't support emoji rendering — use plain text in messages (emojis render as `?`).
- `onattackother` event only fires on SERVER. Client-side only sees `attacked`, `equip`, `healthdelta` etc for the local player.

### Avatars
Character avatars are static PNGs from DST Wiki in `frontend/app/client/public/avatars/`.

### What This Project IS and ISN'T

**IS:**
- A DST admin panel with real-time state
- A visual flow automation engine (triggers, conditions, actions)
- A bridge for running server commands (kick, heal, tp, spawn)
- An in-game UI generator (notifications, panels, labels) via flows
- A pusher of **declarative JSON rules** (`when/do`) that the client-side `rules_engine.lua` interprets to react to local events without a backend round-trip

**IS NOT:**
- A mod framework or code compiler
- A way to write/generate client-side **Lua** via flows (we tried, reverted — the rules engine runs *data*, not generated code)
- A replacement for traditional DST mods

For real-time client-side features (HP bars following mobs, proximity HUDs) that the declarative rules engine can't express, write them as traditional hardcoded Lua in the mod — don't try to generate Lua from flows.
