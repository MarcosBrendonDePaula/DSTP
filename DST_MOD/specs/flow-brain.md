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
| `collect` | walks to the nearest free ground item within `brain_radius` (default 8, centred on the LEADER when there is one) and, with `store: self` (default), stores it in its own container/inventory (`brain_collected { item, count }`); with **`store: event`** it only reports `brain_item_reached { item, item_guid, count, x, z }` and the FLOW decides — `entity_take_item`, `entity_drop_item`, `entity_transfer_item`, or nothing. **No capacity policy in Lua**: a full mob still walks and tries; a failed attempt reports `brain_item_reached { reason: full|refused }` and puts THAT item on a 10 s cooldown (anti-pacing). Ask capacity with `entity_can_accept` → `entity_capacity { count, is_full, num_items }`. `tags`/`prefabs` filter what; skips held, burning, `heavy`, `irreplaceable`, `fire`. Follow has priority: past `follow_max` the mob comes back before picking |
| `target` | `follow`: a player userid (`KU_…`) or an entity guid (number) |
| `anchor_x`, `anchor_z` | `guard` / `wander`: the point (required) |
| `brain_radius` | action radius (default 12): guard zone, attack scan, flee "see" distance, wander range |
| `tags`, `prefabs` | comma lists — what `attack`/`guard` hunt; `flee` runs from `tags` (default: players) |
| `attack_players` | `true` to let `attack`/`guard` target players (default false — players are never targets) |
| `follow_min`/`follow_dist`/`follow_max` | Follow distances (2 / 4 / 6): back off below min, stop at dist, START moving past max |

## One-shot tasks (any mode) — primitives, the flow decides
`entity_collect { guid, item_guid | item + brain_radius, store, timeout, token }` and
`entity_goto { guid, target_guid | goto_x + goto_z, timeout, token }` set `state.task`; the
BT runs it with top priority (after panic) through `FlowBrain.TaskAction` (a WALKTO
BufferedAction; pickup takes the item on arrival unless `store=event`) and reports
`brain_task_done { kind, ok, reason: gone|unreachable|timeout|full|refused, token, item,
item_guid, count }`; the monitor enforces `timeout` (20 s). The mode resumes afterwards. A
mob with no flow brain gets `stay` first. `entity_can_accept` → `entity_capacity { count,
is_full, num_items }` (Klei's `CanAcceptCount`: free slots + stack room).

**Owner's rule (2026-09-12):** Lua exposes primitives and emits data; behaviour policy
("skip when full", "unload into a chest") lives in the flow. That is why there is no
capacity check before a pickup — a failed attempt is reported and the item gets a short
anti-pacing cooldown, nothing more.

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

## Stable ids — never remember a mob by guid

DST reassigns every guid on world load, so `memory pet:<userid> = {{spawn.guid}}` is stale
after the first restart (worse: the number may now point at some other entity). The mod
gives entities a `dstp_id` (`entity_ids.lua` + `components/dstp_id.lua`, format
`e<time><rand><counter>`, saved with the entity, re-indexed on load). Every entity command
resolves `id` FIRST (then `guid`, then `prefab` + `x/z`), and `spawn_result`, every
`brain_*` event, `entity_data` and `entity_found` carry `id`. `Apply` ensures an id, so a
flow-brained mob always has one. `entity_tag_id` tags any other entity; `entity_find
{ prefab, owner_userid | near_userid | x,z, radius }` -> `entity_found { count, entities[] }`
answers "is there already one of mine?".

## Pattern — one pet per player (`examples/flows/Pet_Chester.dstp.json`)

- `player_spawn` -> `memory pet:<userid>` -> exists? `get_entity { id }` (token `pet:<userid>`)
  -> `entity_data` found and prefab == chester -> `entity_brain collect` by id; else
  `spawn_at_player chester { brain: collect, token: pet:<userid> }`.
- `spawn_result` token `pet:*` -> remember `pet:<userid> = {{sr.id}}` and
  `owner:<id> = userid` -> `entity_set_slots { id, slots: petslots pref or 16 }`.
- `player_left` -> `entity_brain stay` by id. `brain_dead` chester with an owner -> 3 s ->
  respawn. `brain_restored` -> refresh memory (id, owner).
- Chat: `!pet` (EXACT match: `!petslots` starts with the same letters) reuses or spawns;
  `!nopet` -> `entity_kill` by id + forget; `!petslots N` -> `entity_set_slots` by id +
  remember the preference, PM on the `entity_slots` ack.

All of it is policy in the flow; the mod only offers the primitives.

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
