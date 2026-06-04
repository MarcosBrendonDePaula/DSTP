# Changelog — DSTP (Don't Starve Together Admin Panel)

All notable changes to the mod. For each Workshop update, copy the relevant
version's notes into the Steam "Change Notes" field.

The mod talks to the DSTP backend through the relay
(https://github.com/MarcosBrendonDePaula/dstp-relay).

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
