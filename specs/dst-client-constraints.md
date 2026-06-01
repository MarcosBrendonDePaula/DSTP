# DST Client/Server Constraints — Hard-won lessons

Things about the DST engine that cost us real debugging time. Read this before
touching anything that crosses the client/server boundary or renders HUD UI.

## The mod runs on the SERVER

`scripts/dstp/client.lua` (despite the name) and `modmain.lua` run on the
**master sim** (`TheWorld.ismastersim`). The HTTP polling, command handlers, and
per-player event listeners are all server-side. The "client" in the name means
"the bridge to our backend", not "the DST game client".

The exception: code inside `if not TheWorld.ismastersim then ... end` (in
`modmain.lua`'s `player_classified` PostInit) is the **game client** path — that's
where widgets render and `net_string`/netvars are read.

## What the game client can and cannot see

| Data | Client sees it? | How |
|------|:--------------:|-----|
| Own player health/hunger/sanity | ✅ | `ThePlayer.replica.health:GetPercent()` (player_classified) |
| Own player position | ✅ | `ThePlayer.Transform:GetWorldPosition()` |
| **Mob health** | ❌ | NOT replicated by default — see below |
| Mob position / prefab / animation | ✅ | replicated natively |
| Current combat target of the player | ✅ | `ThePlayer.replica.combat:GetTarget()` (often nil) |
| `components.*` of anything | ❌ | components are SERVER-only |

**Mobs have no health on the client.** `entity.components.health` doesn't exist
client-side, and `entity.replica.health:GetPercent()` returns `1` for non-players
(the health replica only attaches a classified for `player_classified`, see
`health_replica.lua:7`). This is why a HP bar over a mob always showed full.

## SERVER-only events

`onhitother` and `onattackother` fire on the **attacker on the server**
(`combat.lua:693`/`1106`). The game client never receives them. Since our mod is
server-side, our listeners DO get them — but don't expect the client path to.
The client only sees its own player's `attacked`, `equip`, `healthdelta`, etc.

## Replicating mob health: the "Health Info" technique

DST won't replicate mob health, but a mod can add its **own netvar** and the
engine syncs it. This is what the `Health Info` workshop mod does and what DSTP
now does (`modmain.lua`, AddPrefabPostInitAny):

1. Declare a netvar on the entity (both sides, same GUID/name):
   `inst.dstp_net_hp = net_uint(inst.GUID, "dstp_hp", "dstp_hp_dirty")`
2. SERVER: mirror health into it whenever it changes — hook `health.DoDelta`
   and call `inst.dstp_net_hp:set(currenthealth)`.
3. The netvar auto-syncs to all clients.
4. CLIENT: listen for `"dstp_hp_dirty"`, read `:value()`, cache on the entity
   (`inst.dstp_hp`). The HUD reads `inst.dstp_hp` directly — no backend trip.

Use `net_ushortint` (max 65535) for normal mobs, `net_uint` for big bosses.

### ⚠️ Netvars must be added SURGICALLY, not to everything

We tried a generic `AddPrefabPostInitAny` that added the health netvar to every
entity and it **broke network deserialization** game-wide:
`"Failed to read net var data"` on inventory_classified, forest_network,
player_classified, skeleton_player… and a crash.

Why: netvars are positional — the server and client must declare the **same
netvars, in the same order, on the same entities**. Adding one to entities that
shouldn't have it (or creating it on the client for entities the server didn't)
desyncs the whole entity's netvar stream. Our generic version created the netvar
unconditionally on the client for ALL prefabs, while the server only added it to
ones with `components.health` — instant desync.

The Health Info mod avoids this by adding the netvar only to a **curated prefab
set** and creating it identically on both sides. Rules:
- **Gate by `inst.prefab`, NOT by tag.** This is critical: tags may not be
  set/replicated yet when `AddPrefabPostInitAny` runs, so a tag check can return
  different results on server vs client → the netvar isn't created on one side →
  the value never arrives (bar stays full) or the net stream desyncs.
  `inst.prefab` is deterministic and present on both sides immediately.
- Declare the netvar in the SAME place/condition on server and client.
- Use a curated prefab whitelist (common mobs + bosses), never "every entity".

Status in DSTP: **working.** `modmain.lua` adds the `dstp_hp`/`dstp_hp_max`
netvar to a curated prefab list (`DSTP_HP_PREFABS`); the follow HUD reads
`inst.dstp_hp` and the bar tracks real mob health. Adding more mobs = add their
prefab to the list (the dynamic-bindings proposal would generalize this).

## net_string holds ONE value — coalesce per frame

The per-player UI channel (`player_classified._dstp_ui`) is a `net_string`: it
syncs a **single value**. Calling `:set()` multiple times in one frame means
only the LAST survives. When a sync delivers several `ui_command`s for one
player, the mod must **coalesce them into one `batch`** before `:set()` (see
`ProcessCommands` in client.lua). Symptom of getting this wrong: only one of
several UI updates lands (e.g. live HUD showing stale/empty fields).

## HUD coordinate space

Widgets under a root with `SCALEMODE_PROPORTIONAL` + `ANCHOR_MIDDLE` use DST's
**virtual UI space** (`RESOLUTION_X`/`RESOLUTION_Y`, ~1280×720), centered on
screen — NOT raw pixels and NOT the player's real resolution. So:
- `TheSim:GetScreenPos(worldx, y, worldz)` returns coords in this space; a
  follow widget must be attached to the HUD with the same scale mode to map 1:1.
- Anchor offsets should derive from `RESOLUTION_X/Y ÷ 2` (with a margin), not a
  hardcoded guess. `TheSim:GetScreenSize()` gives real pixels but you usually
  don't want those here.

## Lua sandbox reminders (also in CLAUDE.md)

- No sockets/FFI/threads. HTTP only via `TheSim:QueryServer`.
- `GLOBAL` only in `modmain.lua`; `require()`d modules get it via `Init()`.
- Strict mode: declare before use. `local function` visible only after its line.
- Client-side: use `GLOBAL.pcall`; entities have `replica`, not `components`.
- `TheSim:QueryServer` URL whitelist is hardcoded to `127.0.0.1`/`localhost` —
  hence the relay. No bypass exists.
