# DSTP — Don't Starve Together Panel

Web-based admin panel for Don't Starve Together servers. Manage players, world, chat, and automate server logic — all from your browser.

Built with a DST Lua mod (HTTP polling bridge) + [FluxStack](https://github.com/user/fluxstack) (Bun + Elysia + React + Live Components).

## Architecture

```
DST Game Server (Lua)
    |  POST /api/dst/sync (every 0.5-30s)
    v
FluxStack Backend (Bun + Elysia + SQLite)
    |  WebSocket (Live Components)
    v
Admin Panel (React + React Flow + Monaco)
```

The DST sandbox only allows outbound HTTP via `TheSim:QueryServer()`. The mod polls the backend, sending game state and events. The backend responds with queued commands. No direct connection needed — fully bidirectional over a single HTTP request/response cycle.

## Features

### Player Management
- Real-time player stats (health, hunger, sanity) with animated bars
- Full inventory view with durability, perish %, armor stats
- Character avatars (19 base characters + generic for mods)
- Actions: heal, feed, restore sanity, godmode, kill, kick, ban, respawn
- Give items, teleport, teleport to player
- Set/remove admin permissions
- Ghost detection, combat status, temperature, moisture

### World Control (per-shard)
- Separate controls for Overworld and Caves
- Phase (day/dusk/night), season, weather
- Skip days, rollback, regenerate
- Pause/resume, speed control (0.5x to custom)
- Multi-shard aware: commands go to the correct shard

### Chat
- Real-time chat capture from game via `Networking_Say` hook
- Send messages from panel to game
- Private messaging system via `net_string` + `net_event`
- Panel URL auto-opens in Steam Overlay for admins on join

### Event System
10 configurable event categories (toggle on/off, hot-reload at runtime):

| Category | Events | Default |
|----------|--------|---------|
| Players | join, leave, death, ghost, respawn | ON |
| Chat | chat messages | ON |
| World | day cycle, phase, season | ON |
| Combat | player kills, attacks | OFF |
| Crafting | craft item, build structure | OFF |
| Inventory | equip, pickup, drop | OFF |
| Gathering | chop, mine, harvest, loot drops with item/count | OFF |
| Weather | storms, precipitation | OFF |
| Bosses | boss kills (deerclops, bearger, etc) | OFF |
| Health | HP/hunger/sanity deltas | OFF |

- Configurable debounce per event type (remotely adjustable)
- Auto-detection of custom event schemas (plugins send events, backend infers types)
- Event categories auto-enable when automation flows need them

### Visual Automation (React Flow)
Node-based flow editor for server automation:

**6 Node Types:**
- **Trigger** — 26 event types across all categories
- **Condition** — field/operator/value with true/false branching
- **Action** — 21 game commands with parameter templates
- **HTTP Request** — GET/POST/PUT/DELETE with headers, body, timeout
- **Set Variable** — create named variables from expressions
- **Script** — TypeScript/JS with Monaco Editor, full autocomplete

**Execution Context (n8n-style):**
- Each node registers output in a shared context
- Downstream nodes access via `{{node_id.field}}` or `{{trigger.field}}`
- Deep path resolution: `{{http_1.body.temperature}}`
- Raw value preservation (numbers stay numbers)
- Context is linear: A->B->C, C sees A+B

**Persistence:**
- Flows stored in SQLite (Drizzle ORM)
- Execution logs with timestamps
- Survives server restarts

### Multi-Server / Multi-Shard
- Each DST server identified by `TheWorld.meta.session_identifier` (stable across restarts)
- Overworld + Caves as separate shards, grouped in UI
- Tab-based view: All / Overworld / Caves
- Commands routed to correct shard automatically
- Access via URL: `http://host:port/?server=SERVER_ID`

## Setup

### 1. Install the DST Mod

Copy `modinfo.lua`, `modmain.lua`, and `scripts/` to your DST mods folder:

```
steamapps/common/Don't Starve Together/mods/DSTP/
  modinfo.lua
  modmain.lua
  scripts/dstp/client.lua
```

Enable in your `modoverrides.lua`:
```lua
["DSTP"] = { enabled = true, configuration_options = {
    SERVER_ID = "auto",           -- or "server-1", "server-2", etc
    BACKEND_URL = "http://127.0.0.1:3000",
    POLL_INTERVAL = 2,            -- 0.5 to 30 seconds
    EVT_PLAYERS = true,
    EVT_CHAT = true,
    EVT_WORLD = true,
    -- EVT_COMBAT = false,
    -- EVT_GATHERING = false,
    -- etc
}},
```

### 2. Run the Panel

```bash
cd frontend
bun install
bun run dev
```

Open `http://localhost:3000` — the panel auto-connects when the DST server starts syncing.

### 3. Database

SQLite via Drizzle ORM. One DB file per server in `data/`. Migrations run automatically on first connection.

```bash
bun run db:generate   # generate migration from schema changes
bun run db:studio     # open Drizzle Studio GUI
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Game Mod | Lua 5.1 (DST sandbox) |
| Transport | HTTP polling via `TheSim:QueryServer()` |
| Backend | Bun + Elysia + FluxStack Live Components |
| Database | SQLite (bun:sqlite) + Drizzle ORM |
| Frontend | React 19 + Vite + Tailwind |
| Flow Editor | React Flow (xyflow) |
| Code Editor | Monaco Editor |
| WebSocket | FluxStack Live Components (auto STATE_DELTA) |

## Project Structure

```
DSTP/
  modinfo.lua              # DST mod config (10 event categories)
  modmain.lua              # Mod entry + private message system
  scripts/dstp/
    client.lua             # HTTP bridge, commands, event capture
  frontend/
    app/server/
      live/
        LiveDSTP.ts        # Singleton — server state management
        LiveAutomation.ts  # Flow engine — trigger/condition/action
      services/
        DSTStateStore.ts   # In-memory state cache (survives HMR)
      routes/
        dst.routes.ts      # POST /api/dst/sync endpoint
      db/
        schema.ts          # Drizzle schema
        connection.ts      # SQLite per-server
        repositories/      # Flow, Log, EventHistory, EventSchema repos
        migrations/        # Auto-generated SQL migrations
    app/client/src/
      live/
        DSTPanel.tsx       # Main admin panel UI
      automation/
        FlowEditor.tsx     # React Flow canvas
        AutomationPage.tsx # Flow list + editor + logs
        nodeOutputSchemas.ts # Type system for node I/O
        nodes/             # Trigger, Condition, Action, HTTP, Variable, Script
```

## License

MIT
