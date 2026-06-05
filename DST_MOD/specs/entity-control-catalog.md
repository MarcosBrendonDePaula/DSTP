# Entity Control Catalog

> **Provenance:** distilled from the multi-agent workflow `entity-control-survey` (4 domain sweeps of
> vanilla `/tmp/dstscripts/scripts` + synthesis + adversarial critic; 88 operations surveyed).
> The critic VERIFIED every cited file:line and corrected several danger/keying claims — **read §9
> (Critique & corrections) before implementing**: it overrides the tables where they conflict
> (StopBrain is reason-keyed not ref-counted, set_target durability is overstated, Container:Close
> takes an entity not a userid, plus missing ops). Raw sweep data lives in the workflow transcript.


This spec defines the **entity-control layer** that builds on the entity-events base (`entity-events-catalog.md`). Entity events now hand a flow a specific non-player entity by `guid` (`beefalo_tamed{guid}`, `structure_worked{prefab,x,z}`, `container_opened_entity{container_guid}`, `mount_rider_changed{guid}`, `mob_combat_target{aggressor_guid}`, …). This catalog turns that knowledge into READ and CONTROL actions: a flow can now inspect that entity and make it *do* things.

Everything here runs on the **master sim** (the mod already does), so no field is client-replica-limited. The value of a first-class node over raw `call_component` is **ergonomics + safety**: a named node, fixed/validated args, pcall-containment, and a stable target-resolution contract — not new capability.

## 0. Foundational pieces (build these FIRST)

Nothing in this catalog works without two shared primitives in the mod. Build them before any node.

### 0.1 `resolve_entity` — the GUID/pos resolver
Every action below keys its target the same way. Implement one helper, reuse everywhere.

- **By GUID (preferred):** `Ents[guid]` (`entityscript.lua:178`, global table; canonical `c_inst` resolver at `consolecommands.lua:636`). Returns the live entity or `nil`.
- **By prefab+pos+radius (fallback):** `TheSim:FindEntities(x,0,z,radius,musttags,canttags,oratags)` (`consolecommands.lua:640` `c_list`; `aoeweapon_leap.lua:55`), then filter `.prefab`, take nearest.
- **MANDATORY guard:** every resolve returns `found:false` (never throws) when `inst == nil` or `not inst:IsValid()` (`entityscript.lua:1774`). Event GUIDs go stale — the entity may already be removed.
- **Operational limits:** `Ents[guid]` is `nil` once the entity unloads (sleep/limbo or out of range) and **cross-shard GUIDs never resolve** (each shard has its own `Ents`). A flow keying off an event GUID must act promptly. Surface `found:false` + reason (`gone` / `cross_shard` heuristic) so flows can branch.

### 0.2 Make spawn RETURN the GUID
The single biggest ergonomic unlock. `SpawnPrefab(name)` already returns the entity (`mainfunctions.lua:403`); the existing `spawn_prefab`/`spawn_at_player` commands just discard `ent.GUID`. **Capture it and return it in the sync response** (already bidirectional — no new channel). This closes the **spawn → control → react** loop: spawn an item, then `container_give_item` it; spawn a mob, then `entity_set_leader` / `entity_teleport` / build a follow-HUD on it.

- Pure additive change to existing commands. No risk.
- Add `guid` (and `prefab`, `x`, `z`) to the spawn result so downstream nodes resolve `{{spawn.guid}}`.

## 1. READ nodes

Resolve a target, return a flat object. Side-effect-free. Both nodes share the resolver and the same per-component block shape.

| Rank | Node | Target | Underlying | Returns | Use / Caveat |
|------|------|--------|-----------|---------|--------------|
| **H** | `get_entity` | guid **or** prefab+pos | resolver + walk requested `inst.components.<c>` | flat object (see below) | The headline read. Returns `found:false` on stale GUID. |
| **H** | `list_entities_near` | prefab+pos+radius | `TheSim:FindEntities` → map each | `entities[]` of `{guid,prefab,x,z,distance,…blocks}` | Feeds `foreach`. **Cap at 40** (like foreach); prefer prefab/tag filter to avoid mapping hundreds. |

**`get_entity` output shape.** Always-present native identity, then a component block only if `inst.components.<c>` exists (present-component detection drives shape — mirrors `EntityScript:GetDebugString()` `entityscript.lua:964`):

- **Always:** `found`, `prefab`, `guid`, `displayName` (`:735`), `x/y/z` (`GetPosition :1355`), `isValid`, `ageSeconds` (`GetTimeAlive :435`), `isAsleep` (`:1465`).
- **Tags:** no native API enumerates all tags — expose a `hasTag(query)` test (`:572`) and/or a fixed whitelist scan (`monster/structure/burnt/fire/frozen/sleeping/epic`).
- **Conditional blocks:** `health{percent,current,max,isDead,isHurt}` · `combat{hasTarget,targetGuid,targetPrefab,damage}` · `burnable{isBurning,isSmoldering}` · `freezable{isFrozen,coldness,timeToWearOff}` · `workable{workLeft,canBeWorked,workAction}` · `perishable{percent,isFresh,isStale,isSpoiled}` · `fueled{percent,section,isEmpty}` · `container{isOpen,isFull,numItems,numSlots,items[]}` · `stewer{isDone,isCooking,timeToCook,product}` · `growable{stage,isGrowing}` · `domesticatable{domestication,obedience,isDomesticated,tendency}` · `rideable{isBeingRidden,riderGuid,riderUserid}` · `hunger{percent,isStarving}` · `follower{leaderGuid,leaderPrefab,loyaltyPercent}` · `inventoryitem{isHeld,grandOwnerGuid,grandOwnerUserid}`.

**Caveats:** `combat.target`/`follower.leader` may be invalid — guard `IsValid()` before reading their `prefab`. `container.items[]` can be large — cap and map only `{prefab,slot,stackSize,perishPercent}`, never entity refs. All reads are master-sim only (always true here).

## 2. MOVEMENT + AI nodes

The brain re-decides intent every tick, so most movement commands are **transient** — they get overwritten unless you `StopBrain` first. The robust controls (aggro, leader, sleep, external-speed) are the ones the brain itself *reads*. Build a `puppet`/`release` pair that wraps `StopBrain`+command+`RestartBrain` so authors get durable control without learning the brain-fights-back rule.

| Rank | Node | Target | Component·Method (source) | Params | Use / Danger |
|------|------|--------|---------------------------|--------|--------------|
| **H** | `entity_set_target` | either | `combat:SuggestTarget`/`SetTarget` (`combat.lua:229,466`) | `target_guid`\|`target_userid`, `force?` | Most robust control — brain keeps the target leashed. `SuggestTarget` only if no current target + `cansuggesttargetfn` passes; `SetTarget` forces but still `ShouldAggro`-checks (ally tags / `notarget` / hiding can reject). Mob may `GiveUp` if target flees. |
| **H** | `entity_set_leader` | either | `follower:SetLeader` (`follower.lua:293`) + `AddLoyaltyTime` (`:365`) | `leader_userid`\|`leader_guid`\|`null`, `loyalty_sec?` | Durable "befriend / give a bodyguard". Survives ticks (brain reads `follower.leader`). **Only prefabs with a `follower` comp** (pig/bunnyman/chester/critter) — a hound has none. `SetLeader(nil)` releases. |
| **H** | `entity_sleep` / `entity_wake` | either | `sleeper:GoToSleep`/`WakeUp` (`sleeper.lua:279,323`) | `sleep_sec?` (nil = until woken) | Cleanest reversible "disable mob": internally `StopBrain`+`locomotor:Stop`+clears target. Needs a `sleeper` comp (most mobs have one; `nosleep` SG states block). Damage usually wakes it. |
| **H** | `entity_teleport` | either | `Physics:Teleport` / `Transform:SetPosition` (`teleporter.lua:230,232`) | `x,z` (or `to_guid`/`to_userid`) | Instant relocate. Use `Physics:Teleport` when `inst.Physics` exists (keeps collision/platform sane). **No tile validation** — can strand a land mob on void/ocean; offer "snap to nearest walkable". Brain re-decides from the new spot (pair with sleep/stopbrain to make it STAY). |
| **M** | `entity_speed_mult` | either | `locomotor:Set/RemoveExternalSpeedMultiplier` (`locomotor.lua:490,515`) | `source`,`key`,`mult` | Stacking, source-keyed, auto-cleanup. Does **not** fight the brain (scales the chosen speed). `mult≈0` = frozen-in-place but can still turn/attack; `>1` = faster. Pick a stable `source+key` so the flow can undo. |
| **M** | `entity_puppet` / `entity_release` | either | `StopBrain`/`RestartBrain` (`entityscript.lua:1091,1078`) | `reason` | THE enabler for durable movement. Ref-counted by `reason` — won't clobber the game's own `StopBrain('sleeper')`. **A stopped-brain mob is inert** (won't defend/flee/path) — ALWAYS pair a release; consider a TTL auto-release to avoid zombies. |
| **M** | `entity_move_to` / `entity_move_dir` / `entity_stop` | either | `locomotor:GoToPoint`/`GoToEntity`/`RunInDirection`/`Stop` (`locomotor.lua:1040,982,1141,1091`) | `x,z`\|`to_guid`\|`angle`, `run?` | **FIGHTS THE BRAIN** — transient unless `entity_puppet` first. Pattern: puppet → move_to → on-arrive release. Invalid terrain may strand. Needs a `locomotor`. |
| **M** | `entity_force_attack` | either | `combat:DoAttack` (`combat.lua:1060`) | `target_guid?` | One-frame swing now; still range/cooldown-checks (`CanHitTarget`, misses → `onmissother`). For *sustained* aggression prefer `entity_set_target` (brain drives repeats). Can trigger area hits. |
| **M** | `entity_force_damage` / `entity_kill` | either | `combat:GetAttacked` / `health:DoDelta` / `health:Kill` (`combat.lua:563`, `health.lua:613,528`) | `amount`, `attacker_guid?`, `mode` | Use `GetAttacked(player,…)` to simulate a player hit (full aggro + recoil + loot). `DoDelta(-n)` raw; `Kill()` instant death. **Irreversible on death.** |
| **L** | `entity_go_to_state` | either | `sg:GoToState` (`stategraph.lua:529`) | `state`,`params?` | **Expert-only.** State names are PER-PREFAB; invalid just prints (no crash) but valid-but-wrong desyncs anims/skips `onexit`. Most goals are served better by combat/sleeper/locomotor. Lean toward keeping this in `call_component`. |
| **L** | `entity_push_event` | either | `EntityScript:PushEvent` (`entityscript.lua:1317`) | `event`,`data?` | Generic escape hatch; per-prefab + undocumented, wrong data can crash a listener. **RCE-class — keep as `call_component`, not a named node** (warn like `script`). |
| **L** | `entity_herd_commander` | either | `herd:AddMember`/`commander:AddSoldier`/`leader:AddFollower` (`herd.lua:101`,`commander.lua:101`,`leader.lua:189`) | `member_guid` | Niche grouped-mob systems (beefalo/deer herds, eyeofterror minions). Membership mismatch breaks grouped AI. Prefer `entity_set_leader`. Include only for a herd/boss flow. |

## 3. STATS + STATE nodes

Non-movement state mutations. All `Ents[guid].components.<c>:<m>(...)`, pcall-contained.

| Rank | Node | Target | Component·Method (source) | Params | Use / Danger |
|------|------|--------|---------------------------|--------|--------------|
| **H** | `entity_set_health` / `entity_damage` / `entity_kill` | either | `health:SetPercent`/`DoDelta`/`ForceKill` (`health.lua:550,613,537`) | `percent`\|`amount`, `mode` | The "smite / heal the entity an event flagged" core. `ForceKill` bypasses `invincible`; death → loot + events. **Irreversible on death** — gate behind admin/condition. Not all entities have `health` (pcall). |
| **H** | `entity_extinguish` | either | `burnable:Extinguish` (`burnable.lua:454`) | — | Pure griefing-response win: a `structure_burnt`/`object_ignited` event hands the guid, this puts it out. Safe & reversible. |
| **H** | `entity_set_fuel` | either | `fueled:SetPercent`/`DoDelta`/`MakeEmpty` (`fueled.lua:255,305,127`) | `percent`\|`delta` | Refuel campfire/firepit/flingomatic/lantern from a flow. Zero risk, reversible. "Auto-refuel base fires at dusk." |
| **H** | `entity_set_perish` | either | `perishable:SetPercent`/`AddTime` (`perishable.lua:225`) | `percent`\|`add_sec` | Un-spoil food a `container_item_added` event reported. Safe & reversible. |
| **H** | `entity_freeze` / `entity_unfreeze` | either | `freezable:AddColdness`/`Unfreeze` (`freezable.lua:137,280`) | `coldness?`,`freeze_sec?` | Crowd-control a mob a combat event flagged. **Use `AddColdness`** (routes through resistance/redirect) — vanilla warns against raw `Freeze`. Fully reversible. Won't freeze dead/invisible. |
| **H** | `entity_regrow` | either | `pickable:FinishGrowing`/`Regen` (`pickable.lua:129,386`) | — | Instantly make a picked bush/sapling/grass pickable again. Great garden automation. `MakeBarren` is the destructive inverse (don't expose by default). |
| **M** | `entity_set_domestication` | guid | `domesticatable:DeltaDomestication`+`DeltaObedience` (`domesticatable.lua:165,159`) | `dom_delta`,`obed_delta?` | The partner of `beefalo_tamed{guid}`. Nudges the meter. Keyed by GUID (beefalo overlap defeats prefab+pos). |
| **M** | `entity_force_tame` | guid | `domesticatable:DeltaTendency`→`BecomeDomesticated`→prefab `SetTendency` (`domesticatable.lua:172,88`; `beefalo.lua:565`) | `tendency?` | No single "force-tame" method — needs a small mod helper (bias tendency, then domesticate, then lock). Irreversible-ish (`GoFeral` undo). |
| **M** | `entity_set_maxhealth` | either | `health:SetMaxHealth` (`health.lua:503`) | `amount`, `heal?` | **Side effect: snaps current to new max (heals to full).** Use `SetCurrentHealth` (`:499`) separately if you want max without healing. |
| **M** | `entity_set_work` | either | `workable:SetWorkLeft`/`Destroy` (`workable.lua:83,73`) | `work`\|`destroy` | Soften (1 hit) or armor (raise maxwork) a structure/tree/wall; pairs with `structure_worked`. `Destroy` cleanly finishes + drops loot (**pass the target as destroyer — nil crashes**). |
| **M** | `entity_drop_loot` | either | `lootdropper:DropLoot`/`SpawnLootPrefab` (`lootdropper.lua:401,368`) | `prefabs?`,`pos?` | `DropLoot` spawns the WHOLE table **without killing** — farmable if mis-gated. Prefer `SpawnLootPrefab` (one named prefab, proper fling). |
| **M** | `entity_transform_were` | either | `werebeast:SetWere`/`SetNormal` (`werebeast.lua:113,130`) | `were_sec?` | Force werepig transform. Only `werebeast` prefabs. Reverts on timer / `SetNormal`. Low risk. |
| **L** | `entity_set_invincible` | either | `health:SetInvincible` (`health.lua:145`) | `val` | Makes a mob unkillable — easy to forget to clear. Pair with a `delay` to auto-revert. |
| **L** | `entity_set_uses` | either | `finiteuses:SetPercent`/`Repair` (`finiteuses.lua:114,122`) | `percent`\|`repair` | Hitting 0 fires `onfinished`, may delete the tool. `Repair` is the safe additive form. |
| **L** | `entity_set_stacksize` | either | `stackable:SetStackSize` (`stackable.lua:103`) | `size` | **DANGER:** raw set bypasses `maxsize`, no split/merge — above-max (e.g. >40) desyncs clients / breaks inventory UI. Clamp to real `maxsize`. |
| **L** | `entity_rename` | either | `named:SetName` (`named.lua:22`) | `name` | Only entities that already have `named` (signs/beefalo/players/gravestones). Adding the comp dynamically is fragile. |
| **L** | `entity_set_scale` / `entity_tint` | either | `Transform:SetScale` / `AnimState:SetMultColour` (`abigail.lua:1039`) | `scale`\|`r,g,b,a` | Pure cosmetic (giant/tiny/recolor). Engine methods, not components. Other systems overwrite tint; not persisted. Novelty. |
| **L** | `entity_add_tag` / `entity_remove_tag` | either | `EntityScript:AddTag`/`RemoveTag` (`entityscript.lua:556,560`) | `tag` | **DANGER:** arbitrary tags desync / break AI/targeting/replicas (see dynamic-data-bindings spec). Useful tags only; mostly a footgun. |

## 4. STRUCTURE / CONTAINER / WORLD nodes

Closes the loop on `container_*`, `structure_worked`, `machine_toggled`, `object_activated`, `object_ignited` events.

| Rank | Node | Target | Component·Method (source) | Params | Use / Danger |
|------|------|--------|---------------------------|--------|--------------|
| **H** | `container_read` | guid (`container_guid`) or prefab+pos | `container:GetAllItems`/`NumItems`/`IsFull` (`container.lua:606,103,107`) | — | Read a chest/cookpot/backpack into the flow. Serialize `{prefab,slot,stackSize,perishPercent}` — **never the entity**. Master sim only (replica lacks comps). |
| **H** | `container_drop_everything` | guid or prefab+pos | `container:DropEverything` (`container.lua:182`) | `drop_pos?` | Canonical "loot a chest into the world" (exactly what `treasurechest:onhammered` does). Recurses nested. Use this — NOT `Remove` — to empty a chest safely. |
| **H** | `container_give_item` | guid | `container:GiveItem` (`container.lua:447`) | `item_guid`, `slot?` | Needs a real item **entity** → composes with spawn-returns-guid (spawn item → give). Honors `CanTakeItemInSlot`. |
| **H** | `machine_toggle` | either | `machine:TurnOn`/`TurnOff`/`IsOn` (`machine.lua:86,105,114`) | `on` | One-liner flingomatic / lightning rod / nightlight / Winona device toggle; pairs with `machine_toggled`. Safe. |
| **H** | `entity_set_position` | either | `Transform:SetPosition` (entity method) | `x,z`, `snap_walkable?` | Teleport ANY entity (item/mob/spawned thing) — the entity analogue of player teleport. **No walkability check** — offer "snap to nearest walkable" to avoid void/ocean drops. |
| **H** | `entity_remove` | either | `Inst:Remove` (+ `DropEverything`/`DropLoot` first) (`mainfunctions.lua:505`) | `mode = remove\|droploot_then_remove\|kill` | **ORPHAN RISK: `Remove()` on a container silently destroys its items.** Default to drop-loot-first for containers. `kill` triggers death loot/events; plain `remove` is silent/instant. Irreversible. |
| **M** | `container_force_close` | guid | `container:Close(nil)` (`container.lua:674`) | `userid?` (omit = all) | Anti-grief / anti-AFK: kick someone out of a chest UI. `nil` closes for everyone. Safe. |
| **M** | `burnable_ignite` | either | `burnable:Ignite` (`burnable.lua:352`) | `immediate?` | **DANGER: fire SPREADS via propagator to nearby flammables/structures, irreversible once consumed — can cascade into a base fire.** `fireimmune` ignores it. Strongly gate. (Pair: `entity_extinguish` in §3.) |
| **M** | `writeable_set_text` | either | `writeable:SetText` (`writeable.lua:128`) | `text` | Rewrite a sign / MOTD board / live-scoreboard sign. Bypasses the writer check. **Enforce length** (per writeable layout) so client rendering stays safe. |
| **M** | `growable_force_grow` | either | `growable:DoGrowth`/`SetStage` (`growable.lua:121,207`) | `stage?` | Force a sapling/bush/tree/farm-plant to advance. `DoGrowth` only if a grow timer runs; `SetStage` jumps directly. Pairs with `harvestable`. |
| **M** | `harvestable_harvest` | either | `harvestable:Harvest`/`stewer:Harvest`/`pickable:Pick` (`harvestable.lua:176`,`stewer.lua:276`,`pickable.lua:535`) | `picker_userid?` | Auto-collect a finished crockpot / pick a bush / harvest a planter ("auto-harvest base at dawn"). Only acts when ready; nil picker drops at entity (no orphan). |
| **M** | `structure_repair` | either | `health:SetPercent`/`workable:SetWorkLeft` (`health.lua:550`,`workable.lua:83`) | `percent`\|`work` | `Repairable:Repair` needs a real repair-item entity (awkward) — repair via the backing `health` (boats/walls) or `workable` instead. Pick the right component per prefab. |
| **L** | `rideable_buck` | guid (`mount_rider_changed`) | `rideable:Buck`/`SetSaddle(nil,nil)` (`rideable.lua:201,113`) | `gentle?` | Force-dismount a griefer off a stolen beefalo. Harmless (`bucked` event on rider). `SetSaddle(nil,nil)` strips the saddle. |
| **L** | `activatable_force_activate` | either | `activatable:DoActivate` (`activatable.lua:58`) | `doer_userid?` | Force-pull a lever / open a wardrobe / activate a relic; pairs with `object_activated`. **RISK: many `OnActivate` fns deref a real `doer`** — nil can error; gate to known prefabs or pass a real player. |

> Note: `domesticatable` tame controls and `entity_set_domestication`/`entity_force_tame` live in §3 (STATS) — referenced from `beefalo_tamed{guid}` flows there.

## 5. The "NPC scripted by flow" core (spawn → control → react)

These compose into the marquee use case — a flow that **spawns an NPC, controls it, and reacts to its events**:

1. **Spawn** (`spawn_prefab` + foundational `guid` return) → `{{spawn.guid}}`.
2. **Make it act:** `entity_set_leader` (bodyguard) · `entity_set_target` (sic it on someone) · `entity_teleport`/`entity_set_position` (place it) · `entity_speed_mult` · `entity_sleep`/`entity_puppet`+`entity_move_to` (cutscene/herding).
3. **React:** wire its entity events (`mob_combat_target`, `structure_worked`, `beefalo_tamed`, `mount_rider_changed`) back into the flow, re-resolving via `get_entity` for fresh state.

The durable controls — `set_leader`, `set_target`, `sleep`, `speed_mult` — are what make this work without the brain undoing it. The transient movement controls (`move_to`/`move_dir`) need the `puppet`/`release` wrapper.

## 6. RCE-class — keep as `call_component`, NOT a named node

Same trust class as `script` / `execute`. Too sharp or too per-prefab to give a friendly named node; expose only via the existing admin-gated `call_component` with a warning:

- **`entity_push_event`** — generic per-prefab event injection; wrong data crashes listeners.
- **`entity_go_to_state`** (`sg:GoToState`) — per-prefab state names; valid-but-wrong desyncs. (Listed in §2 as **L** for completeness, but lean toward `call_component`.)
- Any **arbitrary-method** need not covered by a named node above — that's exactly what `call_component` is for.

## 7. What does NOT need a new action (already covered)

The events base + existing nodes already cover these — do **not** add nodes:

- **Spawning at coords / at a player / near-removal / destroy-at-coords** — `spawn_prefab`, `spawn_at_player`, `remove_near`, `remove_near_player`, `destroy_structure` exist. The only gap is the additive **guid return** (foundational §0.2), not a new node.
- **All player-keyed state** (heal/feed/sanity/temp/moisture/ignite/freeze/speed/tags/health/hunger/position…) — covered by the existing player actions + `player_state`. The entity nodes here are the **non-player** analogues; don't duplicate them for players.
- **World/time/weather** (season/phase/skip-day/rain/snow/pause/rollback) — existing world actions.
- **"Inspect the entity an event named"** is the one genuinely missing read — that's `get_entity`/`list_entities_near` (§1), which is why they lead this catalog.

## 8. Build order (implementation checklist)

1. **§0.1 `resolve_entity`** helper (Ents[guid] + FindEntities fallback + `IsValid` guard + `found:false` contract). Everything depends on it.
2. **§0.2 spawn returns guid** — additive change to existing spawn commands.
3. **§1 `get_entity`** — proves the resolver + present-component output shape end to end.
4. **§3 high-value safe mutators** — `entity_set_health`/`damage`/`kill`, `entity_extinguish`, `entity_set_fuel`, `entity_freeze`. Low risk, immediate griefing-response value.
5. **§4 container cluster** — `container_read`, `container_drop_everything`, `container_give_item`, `machine_toggle` (closes the loop on the new container/machine events).
6. **§2 durable AI** — `entity_set_target`, `entity_set_leader`, `entity_sleep`, then the `puppet`/`release` + `move_to` transient set.
7. **Gate the sharp ones** (`burnable_ignite`, `entity_kill`, `entity_set_invincible`, `activatable_force_activate`) behind in-flow `condition {{player.admin}}==true`; keep `push_event`/`go_to_state` in `call_component`.

## 9. Critique & corrections (verified against source — these OVERRIDE the tables above)

I verified every cited method signature and line number against `/tmp/dstscripts/scripts`. The spec's source citations are unusually accurate — **all** of `combat.lua` (229/466/563/1060), `follower.lua` (293/365), `sleeper.lua` (279/323), `health.lua` (145/499/503/528/537/550/613), `container.lua` (103/107/182/447/606/674), `locomotor.lua` (490/515/982/1040/1091/1141), `burnable.lua` (352/454), `freezable.lua` (137/280), `workable.lua` (73/83), `growable.lua` (121/207), `stewer.lua` (276), `harvestable.lua` (176), `finiteuses.lua` (114/122), `stackable.lua` (103), `named.lua` (22), `rideable.lua` (201), `activatable.lua` (58), `machine.lua` (86/105/114), and `mainfunctions.lua` `SpawnPrefab` returning `Ents[guid]` (403) check out exactly. The problems below are about **ratings, keying, and omissions**, not bad citations.

### WRONG / overrated

1. **`entity_set_target` is NOT "the most robust control — brain keeps the target leashed" (rated H).** Verified `combat.lua:466`: `SetTarget` only sets `self.target` (via `EngageTarget`). Whether it *stays* set is governed by the mob's own `keeptargetfn` (`SetKeepTargetFunction`) and its periodic `TryRetarget` (`combat.lua:~265`), which will **drop or replace** an artificially-injected target as soon as the mob's own logic says so (out of leash range, target hiding, a closer threat). For many mobs the forced target survives only seconds. Downgrade the durability claim: `set_target` is robust *only* relative to one-frame `DoAttack`, not absolutely. The genuinely durable controls are `set_leader` (brain reads `follower.leader` every decision) and `sleep` — keep those at H, but reword `set_target` to "more durable than force_attack, but the mob's retarget logic can drop it."

2. **`SetTarget`/`SuggestTarget` fail SILENTLY — the node must read back, but the spec never says to.** `SetTarget` (`combat.lua:467`) no-ops if `IsValidTarget`+`ShouldAggro` fail or the target is a player with the `hiding` state tag; `SuggestTarget` (`combat.lua:229`) no-ops unless `self.target == nil`. Neither returns success. A flow firing `entity_set_target` and assuming it stuck will be wrong with no signal. **Mandate: the node re-reads `combat.target` after the call and returns `applied:true/false`** — otherwise authors get a dead control with no error. Also note `IsValidTarget` routes through `self.inst.replica.combat:IsValidTarget` (`combat.lua:477`) even on the master sim.

3. **`StopBrain`/`RestartBrain` are keyed-by-reason, NOT ref-counted (verified `entityscript.lua:1078/1091`).** The spec says "Ref-counted by `reason`." It is not a counter — `_brainstopped[reason] = true` is a set membership, and a single `RestartBrain(reason)` deletes the key regardless of how many `StopBrain(reason)` calls preceded it. Consequence: **two flow nodes (or two concurrent flow runs) using the same `reason` will step on each other** — the first `release` re-enables the brain while the second node still thinks it's puppeted. The fix is to make the node mint a **unique reason per invocation** (e.g. `puppet:<nodeId>:<runId>`), not let the author pick a bare string. Also the spec's line pair "`(entityscript.lua:1091,1078)`" lists StopBrain=1091/RestartBrain=1078 but writes them in `StopBrain/RestartBrain` order — cosmetic, but the numbers are reversed relative to the names.

4. **`container_force_close` param is wrong.** Spec says `Close(nil)` with param `userid?`. Verified `container.lua:674`: `Container:Close(doer)` takes the **opener entity**, not a userid string, and recurses over `self.openlist` (entity keys) when `doer == nil`. A `userid?` param can't be passed straight through — the mod must resolve userid → player entity first, then call `Close(playerInst)`. Fix the param to `player_userid?` *and* note the resolve step, or it silently closes for nobody.

5. **`entity_sleep` and `entity_puppet` collide on the reserved reason `"sleeper"`.** Verified `sleeper.lua:289` (`GoToSleep` → `StopBrain("sleeper")`) and `:328` (`WakeUp` → `RestartBrain("sleeper")`). If a flow author sets `entity_puppet reason="sleeper"`, a later natural wake (or `entity_wake`) will release their puppet, and vice-versa. The spec claims puppet "won't clobber the game's own `StopBrain('sleeper')`" — true only because they're separate keys, but it **must forbid `"sleeper"` (and any vanilla reason) as a user-supplied puppet reason.** Combined with #3, just don't let authors supply the reason at all.

### MISSING high-value ops

6. **No "give/equip an item to a mob" or "drop a held item."** Mobs with `inventory` (chester, hutch, glommer-likes, krampus, pigs picking up loot) and the broad `inventoryitem` layer are reachable. Verified `Inventory:GiveItem` (`inventory.lua:1029`), `Inventory:Equip` (`:1266`), `Inventory:DropItem` (`:721`). The "NPC scripted by flow" core (§5) spawns a mob and sics it, but can't **arm** it or **hand it loot**. `entity_give_item`/`entity_equip` (mob analogue of the player `give_item`/`equip_item`) is a clear gap, and it composes with the new spawn-returns-guid exactly like `container_give_item` does.

7. **No "teleport a held / in-container item."** §0.1 admits `Ents[guid]` is `nil` once an entity unloads, but the live case it misses: an item that an event named (`container_item_added{container_guid}` → item guid) may be **held/in-limbo** (`IsInLimbo`, `entityscript.lua:338`). `entity_teleport`/`entity_set_position` on it will set a position while it's in limbo (no visible effect) or yank it out of a container mid-hold. The catalog should either (a) flag that movement ops require `not IsInLimbo()` and surface `in_container:true`, or (b) add an explicit `inventory_drop_item` (via `Inventory:DropItem`, `:721`) as the correct way to "eject a held item to the ground." This is a real footgun, not covered.

8. **No health-regen / penalty control, despite `health` being the most-used component.** Verified `Health:StartRegen(amount, period, ...)` (`health.lua:328`), `Health:SetPenalty`/`DeltaPenalty` (`:460/:468`), `Health:SetAbsorptionAmount` (`:440`). "Give this spawned bodyguard passive regen so it survives" and "apply/clear a max-health penalty" are natural automation asks that no domain surfaced. At least `entity_health_regen` (StartRegen) deserves a mention; penalty/absorption can stay in `call_component`.

9. **`list_entities_near` has no tag/predicate pass-through, so the "cap at 40" is a real correctness hole, not just perf.** `TheSim:FindEntities(x,0,z,r,musttags,canttags,oratags)` (used at `consolecommands.lua` `c_list`, `aoeweapon_leap.lua:55`) supports tag filtering **at the engine level** — far cheaper and more correct than mapping hundreds and slicing to 40. The spec mentions "prefer prefab/tag filter" in prose but the node's params don't expose `musttags`/`canttags`. Without them, a dense base (>40 entities in radius) returns an arbitrary 40 and the flow author can't say "only `structure`" or "only `monster`." Add `must_tags`/`cant_tags` params wired straight to `FindEntities`.

### Under-rated dangers

10. **`entity_teleport`/`entity_set_position` "no tile validation" is under-rated as M-context but is a genuine soft-lock vector.** Teleporting a mob/item onto ocean or void with `Transform:SetPosition` (no walkability check) can permanently strand an entity the flow then can't recover (it can't path back; `Ents[guid]` may unload out there and never reload). The "snap to nearest walkable" mitigation is mentioned as optional — for a *named* node it should be the **default behavior**, with raw placement opt-in. Same applies to `entity_teleport` in §2.

11. **`burnable_ignite` cascade is correctly flagged H-danger, but `entity_drop_loot` (`DropLoot`, `lootdropper.lua:401`) is under-rated.** `DropLoot` spawns the **entire** loot table without killing the entity — verified it does not call `Kill`. If reachable in a loop or via a frequent event (`structure_worked`), it's an **infinite item printer** with no resource cost. The spec says "farmable if mis-gated" but rates it M alongside benign ops; it deserves an explicit "gate behind admin + rate-limit/condition" callout at the same severity as `burnable_ignite`.

12. **`entity_set_maxhealth` heal-to-full is correctly caught (verified `health.lua:503` sets `currenthealth = amount`)** — good, no change, just confirming the spec's most surprising claim is right.

### Keying — one true "cannot be keyed by GUID-only" case

13. **`container_give_item` and `entity_give_item` (the new #6) require a SECOND live entity (the item), and that item generally has NO event GUID source** — it only exists if *this same flow* spawned it (spawn-returns-guid, §0.2) or pulled it from a `container_item_added` event. The spec lists `container_give_item` target as `guid` and param `item_guid` but never says where a flow gets a free-floating item GUID otherwise. Flag explicitly: **this node is only usable downstream of `spawn_prefab` or an item-bearing event** — you cannot conjure an item GUID from a prefab name without spawning first. (Everything else in the catalog keys fine by GUID or prefab+pos.)