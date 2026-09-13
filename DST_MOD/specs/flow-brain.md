# Flow brain — a mob whose behaviour the flow controls (by data, not code)

**Why this shape.** A mob's behaviour tree is evaluated many times a second on the DST
server. A flow round-trips through the backend (one poll ≥ 100 ms), so the flow can never
*be* the brain. It can, however, *decide* — which mode, which target, which point — and
let a generic Lua brain execute. Same pattern as `land_claims.lua`: mechanism in a
self-contained Lua module, policy in the flow.

## Pieces

| Where | What |
|-------|------|
| `DST_MOD/scripts/dstp/flow_brain.lua` | the module: `Normalize(spec)`, `ResolveLeader`, `ResolveAnchor`, `ShouldTarget`, `FindTarget`, `Apply(inst, spec)`, `Restore(inst)`. Pure decisions → fengari-tested |
| `DST_MOD/scripts/brains/dstp_flowbrain.lua` | the Klei `Brain`: a `PriorityNode` of `WhileNode(mode == …)` branches built from stock behaviours (`Follow`, `ChaseAndAttack`, `Leash`, `Wander`, `RunAway`, `StandStill`). Reads the state on every tick — a mode change needs no rebuild |
| `commands.lua` `entity_set_brain` | resolver keys (`guid` \| `prefab`+`x`+`z`+`radius`) + spec; optional `token` → `brain_result { token, ok, reason, guid, prefab, mode }` |
| `spawn_prefab` / `spawn_at_player` `brain` | a mob can be born flow-brained (`brain` = JSON spec) |
| node `entity_brain` | the params below, dispatched as `entity_set_brain` |

## Spec (what the flow writes)

| Key | Meaning |
|-----|---------|
| `mode` | `follow` · `guard` · `attack` · `flee` · `wander` · `stay` · `collect` · `default` (restore the prefab's own brain) |
| `collect` | the mob must have a `container` (Chester, Hutch, Packim…): walks to the nearest free ground item within `brain_radius` (default 8) and stores it (`Container:GiveItem`); `tags`/`prefabs` filter what; skips held, burning, `heavy`, `irreplaceable`, `fire` items and stops when full. With a `target` it follows the leader when nothing is left to pick. Emits `brain_collected { item, count }` |
| `target` | `follow`: a player userid (`KU_…`) or an entity guid (number) |
| `anchor_x`, `anchor_z` | `guard` / `wander`: the point (required) |
| `brain_radius` | action radius (default 12): guard zone, attack scan, flee "see" distance, wander range |
| `tags`, `prefabs` | comma lists — what `attack`/`guard` hunt; `flee` runs from `tags` (default: players) |
| `attack_players` | `true` to let `attack`/`guard` target players (default false — players are never targets) |
| `follow_min`/`follow_dist`/`follow_max` | Follow distances (2 / 4 / 6): back off below min, stop at dist, START moving past max |

## Mechanics worth knowing

- **Swap once, restore exactly.** `Apply` stores `brainfn` + the combat `targetfn`/period
  on first use, installs `Combat:SetRetargetFunction(1, FindTarget)` and `SetBrain(flow
  brain)`. `default` puts both back. A second `Apply` only rewrites the state (and drops a
  combat target the new mode forbids).
- **Targets.** `ShouldTarget` is the single predicate: never self, never the leader, players
  only with `attack_players`, else by `tags` then `prefabs`. Only `attack`/`guard` ever
  target. `guard` scans around the anchor; `attack` around the mob.
- **Panic first.** `BrainCommon.PanicTrigger` sits above every mode — a burning mob still
  panics, whatever the flow said.
- **Events back to the flow** (all carry `guid`, `prefab`, `mode`; exposed as triggers):
  - `brain_result { token, ok, reason }` — ack of `entity_set_brain` (needs `token`)
  - `brain_arrived { target_guid|target_userid }` — follow: within `follow_dist` of the
    leader. **Edge-triggered** (once per approach; re-armed when the leader gets past
    `follow_max`), so a mob standing by its leader does not spam the flow
  - `brain_leader_lost { target_userid|target_guid }` — follow: leader gone (once)
  - `brain_target_acquired` / `brain_target_lost { target_guid, target_prefab, target_userid }`
    — from the combat component's `newcombattarget` / `droppedtarget`
  - `brain_dead { killer_guid, killer_prefab, killer_userid }`
  Installed once with the brain swap (a 0.5 s monitor + 3 listeners), removed on `default`.
  They are pushed only for flow-brained mobs, so there is no event category to enable.

## Example — a spider bodyguard that dies with the player's `!recall`

`chat "!guard"` → `get_player` → `spawn_at_player { prefab: spider, token: g, brain:
{"mode":"follow","target":"{{trigger.userid}}"} }`. Later `chat "!attack"` →
`entity_brain { guid: {{spawn.guid}}, mode: attack, tags: "hostile,monster" }`. `!recall`
→ `entity_kill { guid }`. The spider keeps its own loot, sounds, animations — only the
brain is the flow's.

## Tests
`flow-brain.test.ts` → `__lua__/flow-brain-harness.lua` (REAL `flow_brain` + `core` +
`commands`; the Klei BT file is mocked): normalisation, decisions, swap/restore, the
command path (ok / stale guid / bad spec) and spawn-with-brain. Mutation-checked (leader
exclusion). The BT file itself only gets the Lua syntax check — validate in-game with
`!guard`.
