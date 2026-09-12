# Changelog — DSTP (Don't Starve Together Admin Panel)

All notable changes to the mod. For each Workshop update, copy the relevant
version's notes into the Steam "Change Notes" field.

The mod talks to the DSTP backend through the relay
(https://github.com/MarcosBrendonDePaula/dstp-relay).

## [Unreleased]

### Added
- **Data feed (`data_feed.lua`) — the generic server→client data path.** A flow
  sends `feed_start { userid, id, prefabs|tags, radius, fields, interval, max }`
  and the server ships the chosen fields of the entities around that player over
  ONE `net_string` (`player_classified._dstp_feed`, declared once); the client
  writes them as `inst.dstp_<field>` — what UI `bind` props and `ui_track`
  templates read. Fields: `hp`, `hp_max`, `hunger`, `sanity`, `temperature`,
  `fuel`, `moisture`, `burning`, `frozen`, `sleeping` (+ `_max` where it applies)
  or any plain `component.field`. Prefabs and fields are chosen at runtime — no
  netvar, no reload. Per-feed cap (30, hard 60), send only on change, feeds of one
  player merged into one packet, entities keyed by network id. `feed_stop` ends it.
- **Netvar slot pool — "dynamic netvars" the safe way.** `SLOT_COUNT` generic
  `net_float`s (mod config, default 10) are declared on every prefab of the
  `SLOT_PRESET` list (`slot_prefabs.lua`: mobs / mobs+structures), identically on
  both sides at PostInit. `data_feed` assigns their MEANING at runtime (slot i =
  field, first-requested first, survivors keep their index), writes them per tick
  (the engine deltas them per frame, 4 bytes on change) and ships the slot map in
  the JSON packet; the client decodes slot dirty events into `inst.dstp_<field>`.
  Fields that don't fit still ride JSON. So HP, hunger, temperature or any
  `component.field` of any preset prefab can be replicated PER FRAME on a flow's
  request, with no reload.
- **Flow-computed entity values.** `entity_set_data { guid, name, value }` stores a
  plain value on an entity (`inst.dstp_data[name]`); feeds read it as the field
  `data.<name>` — so a bounty, a rank or a label decided by a flow shows up in the
  HUD next to HP. `data_feed` node operation `set`.
- **`ui_track` mode `all`** — one HUD follower per entity in `radius` matching
  `prefabs`/`tags`, created when the entity enters range and destroyed when it
  leaves, all client-side from a single command. `require_hp` skips entities
  without the HP netvar so no bar ever shows a fake 100%.
- **Per-entity templates with local `bind`** — a follower can render any UI tree
  (the `ui_*` children wired under the `ui_track` node). Nodes carry
  `bind = { prop = "entity.<field>" }` (`name`, `prefab`, `hp`, `hp_max`,
  `hp_pct`, `has_hp`, `distance`, or any `dstp_*` netvar cache) and the client
  re-evaluates them every frame — the flow draws the bar, the game feeds it.
- **`layout_math.lua`** — the flex arithmetic (justify start/end/center/between/
  around/evenly, align, `margin` incl. `auto`, `grow`/`flex`, `shrink`, min/max)
  as a pure module ported from rts-dom, mirrored in the panel and pinned to one
  fixture table. Layout is computed in CSS space and converted to DST space once.

### Fixed
- `row` + `align:start` placed children at the BOTTOM (cross axis inverted).
- `display:absolute` ignored element-model children whose x/y live in `style`.
- Legacy single-target follow showed a full bar for entities with no HP data;
  the bar is now hidden until HP is known.
- HP netvar is `uint` (was `ushortint`): Toadstool Misery's 99999 HP read 65%.

## [0.6.0]

### Added
- **Land claims (terrain protection).** A generic server-side protection engine:
  workable (hammer/mine/chop/deconstruct), burnable (fire) and builder (placing
  structures) are overridden via `AddComponentPostInit` so any action inside a
  claim owned by someone else is blocked. Owner, admins and trusted friends pass.
  Blocking MUST be Lua: these methods apply in-frame with no veto callback, and a
  flow round-trips through the backend (too slow). Always installed; with no
  claims, `IsProtected` returns false (≈ zero cost).
- Claims persist with the world via a real component
  (`scripts/components/dstp_landclaims.lua`) that delegates to the
  `dstp/land_claims` singleton — survives restarts, independent of the backend.
- New commands (the POLICY — who may claim, limits, cost — lives in the flow that
  calls these): `claim_add` (owner/x/z/radius; x/z default to the player's
  position), `claim_remove` (by owner or point), `claim_trust` (add/remove a
  trusted userid), `claim_list` → `claim_list_result` event, `claim_check` →
  `claim_check_result` event.

## [0.5.0]

### Added
- `call_component` command — invoke any method of any component on a player
  (`component`, `method`, `args[]`; the sentinel `"{{self}}"` in args becomes the
  player). This is admin-power (RCE-equivalent on the server, same trust class as
  the `script` node / `execute` command) — gate it in the flow with
  `condition {{player.admin}}==true`. Contained by the command pcall (bad
  component/method just logs, never crashes). Lets flows program real gameplay
  mutations from the panel (e.g. movement speed, fastpick) without hardcoded Lua.
- `add_tag` / `remove_tag` — generic player-tag mutation (e.g. `fastpicker`).
- `player_action_start` event — fires when a player begins a long action
  (harvest/pick), before it completes (the "began" event gathering lacked).

## [0.4.0]

### Added
- Player-state commands (real components, master sim): `set_temperature`,
  `set_moisture`, `ignite`/`extinguish`, `freeze`/`unfreeze`, `set_player_speed`
  (locomotor multiplier), `set_health`/`set_hunger`/`set_sanity` (by percent or
  exact value), `set_max_health`. Powers the new "Player State" flow node, which
  lets flows control a player's temperature, wetness, fire, freezing, movement
  speed and vitals — not just top-up (heal/feed) and teleport.

## [0.3.1]

### Fixed
- Drastically smaller Workshop download: the published mod no longer ships
  `scripts_extracted/` (269MB of vanilla Klei reference scripts) or `specs/`
  (internal dev docs). The mod is now ~265KB. Use `build-mod.sh` to assemble a
  clean publish folder (the ModUploader ignores .gitignore).

## [0.3.0]

### Changed
- `all_clients_require_mod = true` — every player joining the server now
  downloads the mod from the Workshop, so the in-game UI built by flows
  (notifications, panels, buttons, shops, HUDs) and the client-side rules
  engine reach all players, not just admins.

## [0.2.0] — Initial release

First public (hidden) release.

### Features
- **Real-time admin** — live players (health/hunger/sanity, position, inventory)
  and actions (kick, ban, heal, teleport, spawn) driven from the web panel.
- **Visual automation** — flow editor with 11 node types reacting to 40+ game
  events across 11 categories (players, chat, combat, crafting, world, bosses…).
- **In-game UI from flows** — notifications, panels, progress bars and clickable
  buttons rendered inside DST and triggered by backend flows.
- **Declarative rules engine** — client-side `when/do` rules for local reactions
  without a backend round-trip.
- **Native multi-shard** — master/caves grouped per server, commands routed to
  the right shard.
- **Per-server auth** — isolated password per server; in-game `#panel` magic
  link for one-click admin login.

### In-game flow
- `#panel` (admin only) returns a one-click login link. The panel address is
  taken live from the relay's upstream — nothing is hardcoded; falls back to
  localhost if the relay is offline.
- First-run nudge: when an admin spawns and the server has no panel password
  yet, the mod tells them to type `#panel` to configure the cluster.

### Notes
- Requires the DSTP backend + relay to function. This is a control panel, not a
  standalone gameplay mod.
