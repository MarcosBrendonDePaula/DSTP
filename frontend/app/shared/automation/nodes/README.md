# Flow node modules

Each flow node is a **module = a folder** with three files:

```
<category>/<subcategory>/<type>/
  meta.ts   # NodeMeta — shared (client + server). Icon, palette, defaults,
            #   output schema, AI tool description. ZERO runtime deps.
  ui.tsx    # export const ui — the React canvas component (frontend only).
  exec.ts   # export const handler — the execution handler (backend only).
            #   Omitted for triggers (they don't execute).
```

A node is registered by **one import line** in each registry (no glob — the
backend ships as one bundle, so static imports are the only bundle-safe option):

- `app/server/live/nodes/registry.ts` — imports `meta` + `exec`
- `app/client/src/automation/nodes/registry.ts` — imports `meta` + `ui`

Imports use the `@shared/...` absolute alias (depth-independent), never `../../`.

## Category tree (3 levels: category / subcategory / node)

```
triggers/
  user/        player_spawn, player_left, player_death, player_ghost, player_respawn,
               player_disconnected
  combat/      player_kill, player_attacked, player_attack_other, player_hit_other
  survival/    player_eat, player_insane/sane, starving/fed, freezing/warm, ...
  world/       new_day, phase_changed, season_changed, moon_phase_changed, ...
  weather/     storm_changed, precipitation, lightning_strike
  bosses/      boss_event, boss_killed, fire_started, hound_warning, hound_attack
  gathering/   player_work, resource_gathered, player_harvest, player_startfire
  inventory/   player_equip, player_pickup, player_drop, player_unequip, ...
  griefing/    structure_burnt, structure_hammered, container_opened/closed
  net/         webhook   (inbound HTTP, not a game event)
  ui/          ui_callback
logic/
  branch/      condition
  timing/      delay
  merge/       wait        (NOTE: wait stays in the engine orchestrator, not the
                            registry — its stateful pause can't be a plain handler)
data/
  player/      get_player, find_player
  vars/        set_variable
  store/       memory
actions/
  game/        action        (the generic action node; action_types stay subtypes)
  http/        http_request
  code/        script
ai/
  agent/       ai_agent
  memory/      ai_memory
ui/
  builder/     ui_builder, ui_panel
  primitives/  ui_col, ui_row, ui_tabs, ui_text, ui_icon, ui_button, ui_bar, ui_spacer
  interactive/ ui_menu, ui_rule
```

The folder path is purely organizational — `meta.category` is what drives the
editor palette grouping, independent of where the folder lives.
