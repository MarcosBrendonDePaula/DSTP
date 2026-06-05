# Entity & World Events Catalog — candidate triggers beyond player events

A survey of DST **entity/world events** (fired on mobs, structures, world objects —
NOT the local player) that could become new DSTP `trigger` nodes. This is a **planning
doc**, not a backlog — implement an entry only when a concrete flow needs it.

It was produced by an adversarial sweep of the extracted vanilla scripts
(`/tmp/dstscripts/scripts`, git-ignored) across four domains (mobs, structures, world,
items) plus an audit of what DSTP already covers. The goal was to answer *"do we have
entity events to build nodes / NPCs from?"* — and the foundation for **NPC-scripted-by-
flow** (spawn a vanilla creature, react to its events, control it via call_component).

## How DSTP already hooks non-player entities

Today the only true entity/world-object hooks are:
- **combat aggro** — `newcombattarget` → `player_combat_target` (`events/nonplayer.lua` `HookCombat`)
- **trader gift** — `trade` → `trade_received` (`events/nonplayer.lua` `HookTrader`)
- **central death fan-out** — `entity_death` on TheWorld → `boss_killed` / `structure_burnt` / `player_death` (`events.lua` single listener → each module's `OnEntityDeath`)
- the world-scoped events in `events/world.lua` / `weather.lua` / `boss.lua`

The hook mechanism for ANY new entity event mirrors `nonplayer.lua`:
`AddComponentPostInit("<component>")` (published on `core` by the events facade, attached
in `modmain.lua`) → in the postinit, cheaply predicate (`HasTag`/`prefab`) → only then
`inst:ListenForEvent(...)` → in the callback, second-stage filter + **gate on
`evt_config.<category>`** + `DSTP.PushEvent`. This is the "mechanic module" pattern's
event sibling.

## ⚠️ Cost model — READ before hooking a common component

All these run **server-side on the master sim**. `AddComponentPostInit` fires for EVERY
entity that ever gains that component. **Common** components (`burnable`, `freezable`,
`pickable`, `perishable`, `workable`, `container`) cover *thousands* of entities, so:

1. The postinit MUST hard-filter (e.g. `inst:HasTag("structure")`, not `inst:HasTag("player")`) and attach the listener ONLY when the predicate passes.
2. The inner callback MUST gate on `evt_config.<category>` (early-return when off) and apply a second-stage prefab/tag filter.
3. **Rare** components (`domesticatable`, `werebeast`, `machine`, `activatable`, `rideable`, `trader`) are basically free — no heavy filtering needed.

## What has NO listenable event (don't promise as a 1-line trigger)

- **"a boss/mob spawned"** — `SpawnPrefab` pushes nothing; no generic per-creature birth event (`childspawner` pushes `childgoinghome` = a child RETURNING, not born). Options: `AddPrefabPostInit(<prefab>)` per-prefab constructor hook (high effort), or for Toadstool the world signal `toadstoolstatechanged`. **The death side is free** via `entity_death` filtered by `data.inst.prefab`.
- **"crockpot/dryer/crop finished", "repaired", "construction finished"** — these run **callback fns + tags** (`stewer.ondonecooking`, `dryer.ondonedrying`, `crop.onmatured`, `harvestable.onharvestfn/ongrowfn`, `repairable.onrepaired`, `constructionsite.onconstructedfn`), NOT a `PushEvent`. Exposing them needs an `AddComponentPostInit` that **wraps** the existing `Set*Fn` (call original, then `DSTP.PushEvent`) — the `land_claims.lua` mechanic-module pattern (HIGH effort).
- **"any creature died"** must REUSE the central `entity_death` dispatch (`boss.lua` `OnEntityDeath`) filtered by `data.inst.prefab` — do NOT add a per-mob `death` listener (duplicates work).

## Recommended triggers (ranked: high-usefulness / low-effort first)

Effort: **low** = world `ListenForEvent`; **medium** = component hook
(`AddComponentPostInit` + `ListenForEvent`, copy `nonplayer.lua`); **high** = mechanic
module (callback-wrap or per-prefab constructor hook). Each new trigger = 3 wiring
points (Lua listener + `TRIGGER_EVENTS` catalog + `FlowEngine.categoryMap`).

| # | Proposed trigger | DST event | Fires on | Hook (effort) | Category | Data emitted |
|---|------------------|-----------|----------|---------------|----------|--------------|
| 1 | `structure_built` | `onbuilt` | the built structure (product) | `AddComponentPostInit("builder")` → one-shot `onbuilt` on the product, OR a tiny override of `Builder:DoBuild` (medium) | crafting | `{userid,name,prefab,x,z}` |
| 2 | `sandstorm_changed` | `ms_stormchanged` | TheWorld | world listener (low) — **VERIFY**: existing `storm_changed` may already cover this `{stormtype,setting}`; drop if so | weather | `{stormtype:1=sand/2=moon, setting:bool}` |
| 3 | `rift_closed` | `ms_riftremovedfrompool` | TheWorld | world listener (low) — counterpart of `rift_spawned`=`ms_riftaddedtopool` (world.lua:130) | world | `{rift_prefab,x,z,shard_type}` |
| 4 | `moon_phase_full` | `moonphasechanged2` | TheWorld | world listener (low) — adds `waxing` flag; **fold into existing `moon_phase_changed`** rather than a new node | world | `{moonphase,waxing:bool}` |
| 5 | `nightmare_phase` | `nightmarephasechanged` | TheWorld (CAVES shard only) | world listener (low) | world | `{phase:calm/warn/wild/dawn,shard_type}` |
| 6 | `structure_worked` | `workfinished` | the worked structure/resource | `AddComponentPostInit("workable")` (medium) — hard-filter to structures/notable prefabs | griefing | `{prefab,userid,name,x,z}` |
| 7 | `object_ignited` | `onignite` | the object that caught fire | `AddComponentPostInit("burnable")` (medium) — the IGNITION detector `boss.lua` notes is missing; catches the arsonist via `data.doer` | griefing | `{prefab,doer_userid,doer_name,x,z}` |
| 8 | `container_opened_entity` | `onopen` | the container entity (knows WHICH chest) | `AddComponentPostInit("container")` (medium) — filter to placed/world containers | griefing | `{container_prefab,container_guid,userid,name,x,z}` |
| 9 | `container_item_taken` | `itemlose` | the container when an item is withdrawn | `AddComponentPostInit("container")` (medium) — per-item, gate + debounce | griefing | `{container_prefab,container_guid,item,slot}` |
| 10 | `container_item_added` | `itemget` | the container when an item is deposited | `AddComponentPostInit("container")` (medium) — pairs with #9 | griefing | `{container_prefab,container_guid,item,slot}` |
| 11 | `beefalo_tamed` | `domesticated` | the tamed creature (beefalo) | `AddComponentPostInit("domesticatable")` (medium, cheap) | new: creatures | `{prefab,guid,tendency,x,z}` |
| 12 | `beefalo_feral` | `goneferal` | beefalo reverting to wild | same `HookDomesticatable` as #11 (medium) | new: creatures | `{prefab,guid,was_domesticated,x,z}` |
| 13 | `mob_transform` | `transformwere`/`transformnormal` | the were-creature (werepig…) | `AddComponentPostInit("werebeast")`, bail if `HasTag("player")` (medium, cheap) — NON-player variant of `character_transform` | new: creatures | `{prefab,guid,form:were/normal,x,z}` |
| 14 | `mob_frozen` | `freeze` | any mob that froze solid | `AddComponentPostInit("freezable")` (medium) — common component, MUST filter to combat mobs | new: creatures | `{prefab,guid,x,z}` |
| 15 | `resource_picked` | `picked` | the plant/bush picked (the node) | `AddComponentPostInit("pickable")` (medium) — VERY common, filter hard; node-side of `player_pick` | gathering | `{prefab,userid,name,loot,count,x,z}` |
| 16 | `item_planted` | `itemplanted` | TheWorld (a deployable placed) | world listener (low) — cheap "something deployed" | world | `{userid,name,x,z}` |
| 17 | `machine_toggled` | `machineturnedon`/`off` | the machine structure (flingomatic…) | `AddComponentPostInit("machine")` (medium, cheap) | world | `{prefab,guid,state:on/off,x,z}` |
| 18 | `object_activated` | `onactivated` | the activatable object (ancient station…) | `AddComponentPostInit("activatable")` (medium, cheap) | world | `{prefab,guid,userid,name,x,z}` |
| 19 | `item_perished` | `perished` | the item that fully spoiled | `AddComponentPostInit("perishable")` (medium) — common, filter | world | `{prefab,guid,x,z}` |
| 20 | `mount_rider_changed` | `riderchanged` | the mount (beefalo/woby) | `AddComponentPostInit("rideable")` (medium, cheap) — mount-side of `player_mounted` | new: creatures | `{prefab,guid,rider_userid,rider_name,mounted:bool}` |
| 21 | `trap_sprung` | `springtrap` | the trap | `AddComponentPostInit("trap")` (medium) — filter the `{loading=true}` arm case | griefing | `{trap_prefab,guid,x,z}` |
| 22 | `toadstool_state_changed` | `toadstoolstatechanged` | TheWorld | world listener (low) — the closest thing to "a boss is now spawnable" | bosses | `{state}` |
| 23 | `crockpot_finished` | (none — `ondonecooking` cb + `donecooking` tag) | the crockpot | mechanic module: wrap `stewer.ondonecooking` (high) | new: production | `{prefab,guid,product,x,z}` |
| 24 | `dryingrack_finished` | (none — `ondonedrying` cb + `dried` tag) | the drying rack | mechanic module: wrap `dryer.ondonedrying` (high) | new: production | `{prefab,guid,product,x,z}` |
| 25 | `crop_matured` | (none — `crop.onmatured` cb) | the farm crop | mechanic module: wrap `crop.onmatured`/`harvestable.ongrowfn` (high) | new: production | `{prefab,guid,product,x,z}` |
| 26 | `creature_spawned` | (none — `SpawnPrefab` pushes nothing) | n/a | `AddPrefabPostInit(<prefab>)` per-prefab constructor hook (high); position is (0,0,0) until placed — read one frame later | new: creatures | `{prefab,guid,x,z}` |

## Raw event findings by domain (for reference)

Beyond the ranked picks, the sweep surfaced these MOB/CREATURE events (all fire on the
mob, hookable via the component in parens): `domesticated`/`goneferal`
(domesticatable), `trade` (trader — the befriend/feed mechanic), `transformwere`/
`transformnormal` (werebeast), `mutate` (spidermutator), `freeze`/`unfreeze`/`onthaw`
(freezable), `startstarving`/`stopstarving` (hunger — also on mobs like beefalo),
`onburnt` (burnable, burned to death), `gotosleep`/`onwakeup` (sleeper),
`startfollowing`/`stopfollowing` (leader), `leaderchanged`/`gainloyalty`/`loseloyalty`
(follower), `riderchanged`/`bucked`/`saddlechanged` (rideable),
`domesticationdelta`/`obediencedelta` (domesticatable — per-tick, noisy).

**Excluded as per-tick / per-hit noise** (need heavy debounce if ever exposed):
`attacked`/`onattackother`/`doattack`, `healthdelta` on mobs, `perishchange`,
`weathertick`/`clocktick`/`seasontick`, `loot_prefab_spawned`/`on_loot_dropped`.

**Client-vs-server:** `onhitother`/`onattackother`/`newcombattarget` and combat/work
internals fire ONLY on the master sim (fine for these backend hooks; none is
client-visible). `houndwarning` fires per-targeted PLAYER (already `hound_warning`).

## Implications for "NPC scripted by flow"

The chosen direction (spawn a vanilla creature → react to its events → control it) needs
only a small foundation on top of what exists:
- **Spawn**: the mod already has `SpawnPrefab` (used by give_item/equip_item/gift); a
  `spawn_entity` node that returns the GUID lets a flow reference the NPC afterward.
- **React**: the most NPC-relevant events are already hooked — `entity_death` (filter by
  prefab/guid = "the NPC died"), `trade` (`trade_received` = "fed the NPC"),
  `newcombattarget` (`player_combat_target` = "NPC turned hostile"). Adding
  `beefalo_tamed`/`startfollowing`/`workfinished` from the table extends this.
- **Control**: already possible via `call_component`/`execute` on the NPC's
  `locomotor`/`talker`/`combat` components, and `ui_*` for a speech bubble.
- **Why spawn doesn't need an event**: since the FLOW spawns the NPC, it already knows
  when it was born — the missing "creature_spawned" event (#26) is irrelevant for
  flow-scripted NPCs.
