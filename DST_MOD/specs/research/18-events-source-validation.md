# 18 missing events — DST source validation

> Saved from workflow `Validate the DST source (event name + push site + payload) of the 18 missing events against the extracted DST scripts before wiring them`. Raw multi-agent research output;
> see the sibling specs for the distilled conclusions.

## events

**1.** 
  - **event:** player_new_character
  - **dst_event:** ms_newplayercharacterspawned
  - **fires_on:** world
  - **fires_on_detail:** Fires on TheWorld (master-sim). Listen via inst:ListenForEvent("ms_newplayercharacterspawned", fn, TheWorld) from a world component. Confirmed by vanilla listener in prefabs/multiplayer_portal.lua:106.
  - **confirmed:** true
  - **data_fields:** 
    - player
    - mode
  - **push_site:** /tmp/dstscripts/scripts/components/playerspawner.lua:298  ->  TheWorld:PushEvent("ms_newplayercharacterspawned", { player = player, mode = isloading and "Load" or MODES[_mode] })
  - **needs_debounce:** false
  - **recommendation:** implement
  - **notes:** ISSUE SOURCE PARTIALLY WRONG, with corrections below.

1) WRONG FILE PATH. Issue claims prefabs/playerspawner.lua. The real push is in components/playerspawner.lua:298 (inside self:SpawnAtLocation). There is no prefabs/playerspawner.lua. Two other pushes exist: debugcommands.lua:1022 (d_portalfx debug only, payload {player=ThePlayer} with no mode) and that's it.

2) WRONG DATA SHAPE. Issue claims positional {player, mode}. REAL payload is KEYED: { player = player, mode = ... }. Read data.player (the player entity) and data.mode (a STRING). data.mode is one of "Load" (when isloading), "Fixed", or "Scatter" (from MODES[_mode]). A listener reading data[1]/data[2] gets nil.

3) CONFIRMED CORRECT: event string is exactly "ms_newplayercharacterspawned"; it fires on TheWorld (NOT the player). Verified by the real vanilla listener prefabs/multiplayer_portal.lua:106 which does inst:ListenForEvent("ms_newplayercharacterspawned", function(world, data) ... data.player ...).

4) CRITICAL GATING GOTCHA (risk of a near-dead listener). The push is in the ELSE branch of:
   if isloading or _mode ~= "fixed" then  <portal-FX path, NO event>  else  <PushEvent>  end
   Default _mode = "fixed" (playerspawner.lua:33; MODES = {fixed="Fixed", scatter="Scatter"}). So this event fires ONLY for a brand-new character on a FIXED-spawn world that is NOT loading in. The common cases -- player portals/rejoins (isloading=true) or scatter-spawn worlds -- take the portal-FX branch and push NOTHING. So as a generic 'player joined/spawned' trigger this is narrow and will frequently NOT fire. It is genuinely a 'new character first spawn on fixed-spawn map' signal, nothing more. Note the mode value can never actually be "Load" here, because isloading=true would have taken the other branch -- so in practice data.mode is "Fixed" (or "Scatter" if that mode were active, but scatter also takes the other branch since _mode ~= 'fixed'... meaning in practice data.mode == "Fixed" only).

RECOMMENDATION: implement IS fine if the intent is specifically 'new player character first-spawned' on a fixed-spawn server -- the listener will fire correctly (on TheWorld, reading data.player). But if the DSTP 'players' category wants a reliable 'player joined the game' trigger, use ms_playerjoined instead: prefabs/player_common.lua:852  TheWorld:PushEvent("ms_playerjoined", inst) -- fires on TheWorld, master-sim only, and the data payload IS the player entity directly (data == player, NOT data.player). This is the broadly-used vanilla event (dozens of component listeners) and fires on every connect/rejoin. Also note ms_playerjoined has a different data shape (bare entity, not a table).
  - **category:** players
**2.** 
  - **event:** player_resurrected
  - **dst_event:** ms_respawnedfromghost
  - **fires_on:** player
  - **fires_on_detail:** The revived player entity. For respawnfromcorpse: revivablecorpse component is added to the player (player_common.lua:2480) and the player ListenForEvent's it on itself (player_common.lua:2668). For ms_respawnedfromghost: pushed directly on the player at the end of both rez paths.
  - **confirmed:** false
  - **needs_debounce:** false
  - **recommendation:** implement
  - **event_data_note:** positional-vs-named correction below
  - **push_site:** DST_MOD-claimed: components/revivablecorpse.lua:77 — self.inst:PushEvent("respawnfromcorpse", { source = reviver, user = reviver }). Recommended unified site: prefabs/player_common_extensions.lua:430 inst:PushEvent("ms_respawnedfromghost") [ghost path] and :479 inst:PushEvent("ms_respawnedfromghost", { corpse = true, reviver = source }) [corpse path].
  - **data_fields:** 
    - source
    - user
  - **notes:** CLAIMED SOURCE IS PARTIALLY WRONG. (1) Push site IS real: components/revivablecorpse.lua:77 fires respawnfromcorpse on the PLAYER corpse (master-sim only, once per revive). (2) DATA SHAPE CLAIM IS WRONG: issue says positional {source, user}; the REAL table is NAMED keys { source = reviver, user = reviver } — both keys hold the SAME reviver entity (the player who revived). Verified against the handler OnRespawnFromPlayerCorpse (player_common_extensions.lua:749) which reads data.source and data.user. (3) BIGGER PROBLEM — respawnfromcorpse is TOO NARROW: it only fires in the revivable-corpse game mode (ghosts disabled). Normal ghost revival (Telltale Heart, Life Giving Amulet, Touch Stone, Booster Shot, battlesong, pocketwatch) fires respawnfromghost instead — NOT respawnfromcorpse. So a listener only on respawnfromcorpse would be a near-dead listener on standard servers. RECOMMENDATION: listen for ms_respawnedfromghost on the player instead — it is the UNIFIED completion signal pushed on the player at the END of BOTH rez paths (player_common_extensions.lua:430 ghost, :479 corpse). Its data is empty {} for the ghost path and { corpse = true, reviver = <source player or nil> } for the corpse path, so DO NOT assume source/reviver is always present — null-guard it. If you must use the early/intent events instead, register BOTH respawnfromghost (data: {source=item, user=giver} — fields vary by source, can be nil) AND respawnfromcorpse on the player. Marked confirmed=false because the issue's data shape (positional) and source choice are both incorrect.
  - **category:** players
**3.** 
  - **event:** player_migrated
  - **dst_event:** ms_playerdespawnandmigrate
  - **fires_on:** other
  - **fires_on_detail:** TheWorld (the migrate event fires on the world). The migrating player is data.player. NOTE: the issue's claimed source (player_common.lua OnDespawn) is NOT an event at all — it is a method on the player prefab, and the only thing it pushes is player_despawn (on the player, no data).
  - **confirmed:** false
  - **needs_debounce:** false
  - **push_site:** components/worldmigrator.lua:208: TheWorld:PushEvent("ms_playerdespawnandmigrate", { player = doer, portalid = self.id, worldid = self.linkedWorld, fxoverride = fxoverride, })
  - **data_fields:** 
    - player
    - portalid
    - worldid
    - x
    - y
    - z
    - fxoverride
  - **recommendation:** skip
  - **notes:** The issue's claimed source is WRONG. (1) There is NO `player_migrated` event in the DST scripts — `grep -rn "player_migrated"` returns zero hits, so a listener for that string is a guaranteed dead listener (audit bug #5/#6 class). (2) `player_common.lua:1417 OnDespawn(inst, migrationdata)` is NOT a PushEvent — it is a plain prefab METHOD: assigned `inst.OnDespawn = OnDespawn` at player_common.lua:2951 and called directly via `player:OnDespawn(migrationdata)` from playerspawner.lua:83 inside PlayerRemove. A ListenForEvent listener can never fire from a method call. (3) The ONLY event OnDespawn pushes is `player_despawn` (player_common.lua:1466 `inst:PushEvent("player_despawn")`) — it fires ON THE PLAYER with NO data table; `migrationdata` is consumed by the function body but NOT forwarded to the event, so player_despawn can't even distinguish migrate vs logout vs delete.

CORRECT SOURCE for a migration signal: `ms_playerdespawnandmigrate`, pushed on TheWorld (NOT the player) by 4 sites: components/teleporter.lua:108, components/worldmigrator.lua:208, prefabs/player_common_extensions.lua:560, stategraphs/SGwilson.lua:20009. Data table: { player=<entity>, portalid, worldid, x, y, z, fxoverride } (x/y/z and portalid/fxoverride vary by call site; worldmigrator passes portalid+fxoverride, teleporter passes x/y/z). The migrating player is `data.player`. Related world events: `ms_playerdespawn` (data is the bare player entity, not a table — mainfunctions.lua:1774) and `ms_playerdespawnanddelete`. All three are internal shard-control (ms_) events consumed only by components/playerspawner.lua (ListenForEvent at lines 211-213).

RECOMMENDATION: SKIP as specified. The DSTP mod is a CLIENT-side mod (per CLAUDE.md: client has replica, no components, and listeners run on the local player). `ms_playerdespawnandmigrate` fires SERVER-side on TheWorld and is a server-authoritative shard event — the client cannot reliably listen to it for a remote player, and there is no player_migrated event to bind. If a "player migrated to caves/overworld" trigger is genuinely wanted, it must be implemented SERVER-side as a hardcoded mechanic module hooking TheWorld:ListenForEvent("ms_playerdespawnandmigrate", ...) and forwarding data.player.userid + data.worldid to the backend — NOT as a client event listener, and NOT under the string `player_migrated`.
  - **category:** players
**4.** 
  - **event:** rift_spawned
  - **dst_event:** ms_riftaddedtopool
  - **fires_on:** world
  - **fires_on_detail:** TheWorld (master/overworld via forest.lua, and caves via cave.lua — riftspawner is a world component). Push is an explicit TheWorld:PushEvent, so it always lands on TheWorld regardless of which shard's riftspawner ran.
  - **confirmed:** true
  - **needs_debounce:** false
  - **push_site:** /tmp/dstscripts/scripts/components/riftspawner.lua:85 — TheWorld:PushEvent("ms_riftaddedtopool", {rift = rift})
  - **data_fields:** 
    - rift
  - **recommendation:** implement
  - **notes:** ISSUE PARTLY WRONG — two corrections.

1) DATA SHAPE: the issue claims `{rift}` (positional). The real call is `TheWorld:PushEvent("ms_riftaddedtopool", {rift = rift})` — a KEYED table. So the field is `data.rift`, an ENTITY reference to the spawned rift portal, NOT a positional element. Listen via `inst:ListenForEvent("ms_riftaddedtopool", fn, TheWorld)` and read `data.rift`. Confirmed by riftspawner.lua:85 (in RiftSpawner:AddRiftToPool). Sibling event for removal is `ms_riftremovedfrompool` at line 68, same `{rift = rift}` shape.

2) shadowrift_opened IS A DIFFERENT EVENT — do NOT use it for "rift spawned". charliecutscene.lua:238 does `TheWorld:PushEvent("shadowrift_opened")` with NO data table. This is a one-time WORLD-STATE TOGGLE that *enables the shadow rift type to start spawning* (riftspawner.lua:37 listens and calls EnableShadowRifts → sets WORLDSTATETAGS "SHADOW_RIFTS_ACTIVE"=true). It does not fire per rift. Its counterpart is `lunarrift_opened` (no data; pushed from wagstaff_npc.lua:614, plus console/debug commands). Both fire on TheWorld but mean "this rift category is now active," not "a rift appeared." If you want a 'rift type unlocked' event that's a separate, distinct trigger from 'rift spawned'.

ENTITY vs TYPE: data.rift is the portal entity. To know which kind of rift (lunar vs shadow vs other), read `data.rift.prefab` on the entity — the rift_prefab arg passed to AddRiftToPool is NOT included in the event data. Note the rift entity is a server-side prefab; reading .prefab off it server-side is fine (this fires on the master sim / world, so the mod sees the full entity).

FREQUENCY: low — fires once per rift spawn (capped by TUNING.MAXIMUM_RIFTS_COUNT and a spawn-delay timer). No debounce needed.

RECOMMENDATION: implement using dst_event "ms_riftaddedtopool" on TheWorld, expose data.rift (and derived data.rift.prefab for the rift kind). Do not register shadowrift_opened/lunarrift_opened under the same "rift_spawned" event — if those are wanted, register them separately as a "rift_type_enabled" event (no data).
  - **category:** world
**5.** 
  - **event:** boss_warning
  - **dst_event:** epicscare
  - **fires_on:** other
  - **fires_on_detail:** Fires on EVERY nearby entity (v) returned by TheSim:FindEntities within range 15, filtered by scareoneoftags={"_combat","locomotor"} and scareexcludetags={"epic","INLIMBO"}. Players match (they have _combat + locomotor tags) so it DOES fire on the player, but it equally fires on every nearby mob/creature. It is a broadcast AoE fear pulse, not a player-targeted event.
  - **confirmed:** false
  - **needs_debounce:** true
  - **recommendation:** implement_with_debounce
  - **push_site:** components/epicscare.lua:23 — v:PushEvent("epicscare", { scarer = self.inst, duration = duration or self.defaultduration })
  - **data_fields:** 
    - scarer
    - duration
  - **notes:** Claimed source string ("epicscare") and data fields ({scarer, duration}) are CORRECT, but the claim "fires on player" is misleading. Real call site: EpicScare:Scare() in /tmp/dstscripts/scripts/components/epicscare.lua line 23. It iterates FindEntities (range 15, scareoneoftags={"_combat","locomotor"}, scareexcludetags={"epic","INLIMBO"}) and pushes onto each matched entity `v` — which includes the player (player_common.lua:2563 adds _combat, locomotor.lua:271 adds locomotor) AND all nearby mobs. So fires_on is effectively player-OR-mob, not player-only.

Data shape: { scarer = <the epic boss inst, an entity NOT a string/name>, duration = <number, seconds, e.g. 5> }. Confirmed by listeners: braincommon.lua:128 and useshield.lua:21 read data.duration.

SERVER-ONLY: epicscare is a server component method invoked from stategraphs (SGbeequeen:31, SGklaus:18, SGstalker, SGdaywalker, SGeyeofterror, SGshadow_chesspieces, SGalterguardian_phase4_lunarrift) plus wagboss_missile.lua:372 / wagboss_robot. It never fires client-side — must be listened for on the server via the mod and the listener attached to each player inst (ListenForEvent on the player works since players are valid v targets).

Caveats for registration: (1) fires repeatedly per boss fight (each scare animation), so MUST debounce/edge-detect per player. (2) `scarer` is an entity, not a readable boss name — to expose a name you'd need scarer.prefab or scarer:GetDisplayName(). (3) Semantics: this is a "fear/panic pulse landed near me" signal, NOT a boss-spawn or boss-phase warning. If the bosses category wanted a true spawn/phase warning, this is the WRONG event and should be SKIPPED; if "an epic's scare AoE hit a player" is acceptable, implement on the player with debounce, reading scarer (mob entity/prefab) and duration.
  - **category:** bosses
**6.** 
  - **event:** player_pick
  - **dst_event:** picksomething
  - **fires_on:** player
  - **fires_on_detail:** The picker entity (the player doing the harvest). Vanilla player_common.lua listens for it on the player in RegisterMasterEventListeners (master/server sim).
  - **confirmed:** true
  - **push_site:** /tmp/dstscripts/scripts/components/pickable.lua:481 and :505 — picker:PushEvent("picksomething", { object = self.inst, loot = loot })
  - **event_string_note:** picksomething
  - **data_fields:** 
    - object
    - loot
  - **needs_debounce:** false
  - **recommendation:** implement
  - **notes:** CONFIRMED, with one correction to the issue's data shape. The issue wrote the data table as positional `{object, loot}` — it is actually a NAMED-KEY table: { object = self.inst, loot = loot }. Real field names are `object` and `loot`.

- Event string: "picksomething" (exact). Fires ON the player (the `picker` arg of Pickable:Pick → SpawnProductLoot). Server/master-sim only (it's pushed from the component, and player_common registers it in RegisterMasterEventListeners). So listen on the player entity, server-side.
- `object` = the harvested source entity (the bush/plant, `self.inst`). To get its prefab use data.object.prefab. Vanilla's own OnPickSomething reads data.object.components.pickable.picksound, confirming the field name.
- `loot` is NOT a stable shape: at line 481 (lootdropper/GenerateLoot path) it's an ARRAY of spawned item entities; at line 505 (single SpawnPrefab path) it's a SINGLE item entity. Both are live game entities, not prefab strings. If you forward loot to the backend, normalize: if it's a table without .prefab treat as a list, else single. Read .prefab (and .components.stackable for count) per item.
- GUARD: the event ONLY pushes when `inventory` is truthy (picker has an inventory component) AND loot was produced (#loot>0 / loot~=nil). Players always have inventory, so for player picks it fires reliably. Pickables that drop to the ground (self.droppicked) do NOT push picksomething — those use the separate "picked" event on the plant instead.
- Do NOT confuse with: (a) "picked" pushed on the PLANT (self.inst) with fields {picker, loot, plant} — different entity; (b) "picksomethingfromaoe" {harvestedcount=...} for AOE scythe harvests — different event/fields. If you want AOE harvests counted too, add a separate listener for picksomethingfromaoe.
- Also pushed (same event/fields) from prefabs/moonbase.lua:379 — same contract, no special handling needed.
- No debounce needed: it's a discrete per-pick action, not a per-tick delta.
  - **category:** gathering
**7.** 
  - **event:** player_mine_chop_start
  - **dst_event:** working
  - **fires_on:** player
  - **fires_on_detail:** The worker entity = act.doer = the player. Pushed from Workable:WorkedBy_Internal via worker:PushEvent("working", ...). The worked target (tree/rock/structure) is in data.target, NOT the entity the event fires on.
  - **confirmed:** true
  - **needs_debounce:** true
  - **push_site:** DST_MOD/scripts_extracted/scripts/components/workable.lua:148  worker:PushEvent("working", { target = self.inst })
  - **data_fields:** 
    - target
  - **recommendation:** implement_with_debounce
  - **notes:** CLAIM CONFIRMED (with corrections). The issue's source is accurate: components/workable.lua line 148 — `worker:PushEvent("working", { target = self.inst })`, inside Workable:WorkedBy_Internal. The worker is act.doer (the player), so the event FIRES ON THE PLAYER, and is master-sim/server-side (workable is a server-only component — fine for the mod's server-side DSTP listeners).

DATA SHAPE: the table has exactly ONE field: `target` (the worked entity reference, e.g. a tree/rock/structure). Use `data.target.prefab` for the name. There is NO `action`, `workleft`, or `numworks` in THIS event (those live on sibling events: `worked` carries {worker, workleft} on the TARGET; `finishedwork` carries {target, action} on the PLAYER — already wired in DSTP as `player_work`).

GOTCHA #1 — NOT a "start" event, it's per-tick. `working` fires on EVERY work application (every axe/pickaxe swing via DoToolWork → WorkedBy → WorkedBy_Internal), not once at the start of chopping/mining. The name `player_mine_chop_start` is misleading. To get true "start" semantics you MUST edge-detect/debounce per (player,target): suppress repeats while the same target is still being worked (e.g. track last target + timestamp, only emit when target changes or after an idle gap). Without this it will spam one event per swing.

GOTCHA #2 — `target` can be nil. There is a SECOND `worker:PushEvent("working",{})` (empty table) in actions.lua (lines 1313 & 1333, the oar/rowing "wet tool can fall out of hand" hack — not real work). That push has NO target. So a listener MUST nil-guard `data.target` and bail if absent, otherwise rowing falsely triggers a mine/chop event.

GOTCHA #3 — `working` does not tell you mine vs chop. The action (CHOP/MINE/HAMMER/DIG) is NOT in this event's data. If you need to distinguish, read it from the target's workable action or wait for `finishedwork`/`worked`. workable.lua does NOT store the action on the working push.

RECOMMENDATION: implementable but only WITH per-target debounce/edge-detection AND a nil-guard on data.target. Register on the player: player:ListenForEvent("working", fn). Note DSTP already covers work COMPLETION via the existing `finishedwork` → `player_work` listener in events/gathering.lua; this `working` event is the per-swing/began signal, so make sure it adds value over `startlongaction` (already wired as `player_action_start`) before implementing.
  - **category:** gathering
**8.** 
  - **event:** player_min_health
  - **dst_event:** minhealth
  - **fires_on:** other
  - **fires_on_detail:** Fires on self.inst — the entity that owns the health component. Technically that CAN be the player, but in practice it fires on specific bosses/special mobs (daywalker, sharkboi, alterguardian, lunar_grazer, stageusher, punchingbag, deck_of_cards, hedgehound_bush, wagdrone) that call health:SetMinHealth(1). It is NOT fired on players in normal gameplay (see needs_debounce/notes).
  - **confirmed:** false
  - **needs_debounce:** false
  - **push_site:** components/health.lua:578 — self.inst:PushEvent("minhealth", { cause = cause, afflicter = afflicter })
  - **data_fields:** 
    - cause
    - afflicter
  - **recommendation:** skip
  - **notes:** Issue's claimed source is PARTLY WRONG. The event string ("minhealth") and the data fields ({ cause, afflicter }) are CORRECT. But the claimed location is wrong: the PushEvent is NOT in DoDelta — it is in Health:SetVal (components/health.lua:565), at line 578. (DoDelta line 640 calls SetVal, so it's reachable via DoDelta, but the literal push site is SetVal.)

It fires on self.inst (the health-component owner), NOT on TheWorld.

WHY SKIP as a 'player' combat event: minhealth defaults to 0 (health.lua:65). The event only fires in the branch `if val <= min_health then ... PushEvent("minhealth")`. With the default min_health=0, health reaching 0 goes down the death path, so minhealth is only meaningful when something has called health:SetMinHealth(>0). Grep shows SetMinHealth is called ONLY on a fixed set of boss/special prefabs (daywalker, daywalker2, sharkboi, alterguardian_phase1/4, lunar_grazer, stageusher, punchingbag, deck_of_cards, hedgehound_bush, wagdrone_rolling, worm_boss_util). For PLAYERS it is set ONLY via the debug console command c_setminhealth(n) in consolecommands.lua:396 — never during normal gameplay. player_common does not call SetMinHealth.

CONCLUSION: A 'player_min_health' listener registered on the player entity in the combat category is effectively a DEAD listener (audit bug #5/#6 class) — it will never fire from real player combat. The clean push site exists, but it belongs to boss/mob mechanics, not players. SKIP it as a player combat event. (If a boss-death-floor mechanic is ever wanted, it would need to be a boss/world-scoped listener with a clear use case, not a player event.)
  - **category:** combat
**9.** 
  - **event:** player_block
  - **dst_event:** blocked
  - **fires_on:** player
  - **fires_on_detail:** Fires on self.inst — the entity being attacked (the defender/victim) inside Combat:GetAttacked. For a player who blocks an incoming hit, this is the player entity. NOT TheWorld. The combat component runs server-side (master sim), so this listener only fires on the server, never the client — consistent with the audit note that onattackother/server-only combat events don't replicate to the client.
  - **confirmed:** true
  - **data_fields:** 
    - attacker
    - damage
    - spdamage
    - original_damage
  - **push_site:** components/combat.lua:700
  - **needs_debounce:** false
  - **recommendation:** implement
  - **notes:** CONFIRMED with one correction to the issue's claimed data shape.

Real push site (verbatim, components/combat.lua:700):
  self.inst:PushEvent("blocked", { attacker = attacker, damage = damage, spdamage = spdamage, original_damage = original_damage })

Event string: "blocked" (correct in the issue).
File: components/combat.lua (correct in the issue).
Fires ON: the DEFENDER entity (self.inst inside Combat:GetAttacked) — for a player blocking an incoming attack, this is the PLAYER. The issue says "player:PushEvent(...)" which is right in spirit: it's the player being attacked, not the attacker and not TheWorld.

DATA TABLE — issue is WRONG/incomplete. It claims {attacker, damage}. The REAL table is a 4-field NAMED table:
  - attacker        (entity that dealt the blocked hit; may be nil)
  - damage          (post-armor damage value that was blocked)
  - spdamage        (special/planar damage table, may be nil)
  - original_damage (pre-armor/pre-mult incoming damage)
Register the listener and read these named keys. There is no positional {attacker, damage} array — it's a keyed table. attacker can be nil, so guard it (use attacker and attacker.userid or a name lookup).

WHEN it fires: inside Combat:GetAttacked, in the `else` branch when blocked==true. blocked is set true in two paths: (1) ShouldRecoil returns true (armor/shield recoil), or (2) damage was fully absorbed / target was invincible (the (damage>0 or spdamage) and not IsInvincible() guard failed). So it fires once per INCOMING ATTACK that the player blocks — event-driven per hit, not per-tick/per-frame. It can burst when a player is swarmed (one per blocked hit) but does not self-fire continuously, so a hard debounce is NOT required. Mirror the existing combat-category handling (player_attacked = "attacked" on the same entity, pushed 3 lines above at combat.lua:691); apply the same light coalescing if combat events are already debounced.

Category 'combat' is correct: this is the natural sibling of player_attacked, both pushed from Combat:GetAttacked on the defender. Note 'blocked' is a very common armor/prefab event (armor_wood, armor_marble, abigail, etc. all ListenForEvent('blocked', ..., owner)), so the push site is well-exercised and definitely live — not a dead listener.

No existing DSTP registration found in DST_MOD/scripts/dstp/client.lua for player_block/'blocked', so this is a net-new listener to add on the player entity.
  - **category:** combat
**10.** 
  - **event:** player_attack_miss
  - **dst_event:** onmissother
  - **fires_on:** player
  - **fires_on_detail:** Fires on the attacker = self.inst of the Combat component (the entity performing the swing). When a player attacks and misses, self.inst IS the player, so listening on the player entity works — same pattern the mod already uses for onattackother/onhitother. Also pushed by various mob stategraphs (SGbearger, SGdeerclops) on themselves, but those are mobs, not players, so they won't reach a player listener.
  - **confirmed:** true
  - **push_site:** DST_MOD/scripts_extracted... -> components/combat.lua:1088 — self.inst:PushEvent("onmissother", { target = targ, weapon = weapon })
  - **event_field_note:** N/A
  - **data_fields:** 
    - target
    - weapon
  - **needs_debounce:** false
  - **recommendation:** implement
  - **notes:** CONFIRMED. Canonical push site is components/combat.lua:1088 inside Combat:DoAttack: `self.inst:PushEvent("onmissother", { target = targ, weapon = weapon })`. It fires on self.inst (the attacker) when CanHitTarget fails (out of range / target dodged) or for AOEarc swings. For a player's missed swing, self.inst is the player, so `player:ListenForEvent("onmissother", ...)` fires correctly — identical to the already-working onattackother/onhitother listeners in DST_MOD/scripts/dstp/events/combat.lua (lines 45-68).

ISSUE SOURCE IS BASICALLY CORRECT BUT IMPRECISE: the claim `player:PushEvent("onmissother", {target, weapon})` has the right event string and the right two fields, but (a) the real receiver is self.inst (Combat component owner / attacker), not a literal `player` var, and (b) the table uses NAMED keys `{ target = ..., weapon = ... }`, not positional. data.target and data.weapon are raw ENTITIES, not strings.

DATA SHAPE — both fields are entities and weapon CAN BE NIL:
- data.target = the entity that was missed (extract .prefab / .GUID / :HasTag('player')).
- data.weapon = the equipped weapon entity, or NIL for bare-hand attacks (weapon = self:GetWeapon() returns nil). MUST nil-guard exactly like the existing onattackother handler does: `weapon = data and data.weapon and data.weapon.prefab or nil`.

Recommended emit (mirror the sibling handlers in events/combat.lua, gate on evt_config.combat):
  player:ListenForEvent("onmissother", function(inst, data)
    if not evt_config.combat then return end
    local target = data and data.target
    DSTP.PushEvent("player_attack_miss", {
      userid = uid, name = pname,
      target = target and target.prefab or "unknown",
      target_guid = target and target.GUID or nil,
      target_is_player = target and target:HasTag("player") or false,
      weapon = data and data.weapon and data.weapon.prefab or nil,
    }, data)
  end)

SERVER-ONLY (fine for us): Combat is a server component (clients have replicas, no components), so onmissother only exists server-side — confirmed by specs/dst-client-constraints.md:33-38 which lists the onattack/onhit family as server-only. DSTP is server-side, so the listener gets it. No debounce needed: it fires once per missed swing, not per-tick.
  - **category:** combat
**11.** 
  - **event:** player_combat_target
  - **dst_event:** newcombattarget
  - **fires_on:** other
  - **fires_on_detail:** The entity that owns the combat component and is ACQUIRING a target — overwhelmingly mobs/NPCs with a retarget function (SetRetargetFunction/TryRetarget) or things explicitly aggroed via combat:SetTarget(player). It does NOT fire on the player in normal gameplay (see notes).
  - **confirmed:** false
  - **needs_debounce:** false
  - **push_site:** components/combat.lua:385 — self.inst:PushEvent("newcombattarget", {target=target, oldtarget=oldtarget})
  - **data_fields:** 
    - target
    - oldtarget
  - **recommendation:** skip
  - **notes:** The issue's claimed event STRING and DATA TABLE are correct, but its claimed shape `{target, oldtarget}` (array) is wrong and its implied entity (the player) is WRONG.

EXACT call site (single push site in the whole codebase): components/combat.lua:385, inside `Combat:EngageTarget(target, oldtarget)`:
    self.inst:PushEvent("newcombattarget", {target=target, oldtarget=oldtarget})
So the real data table is a KEYED table: { target = <ent>, oldtarget = <ent or nil> } — NOT a positional array {target, oldtarget}. Listener must read data.target / data.oldtarget.

WHO it fires on: `self.inst` = the entity owning the combat component that is ENGAGING a target. EngageTarget is only reached via Combat:SetTarget(target) (line 472-473) with a non-nil target (SetTarget calls DropTarget then EngageTarget; EngageTarget guards `if target then`). SetTarget(non-nil) is driven by AI retargeting (TryRetarget/SuggestTarget via SetRetargetFunction) and by explicit aggro calls — i.e. MOBS. This is a SERVER-only event (combat component is master-sim only).

WHY NOT THE PLAYER (the dead-listener trap): I checked every player-side caller. In playercontroller.lua every single `combat:SetTarget` call is `SetTarget(nil)` (drop target) — lines 882,941,985,1041,1142,1188,1233,1353,4037,4218,4252,4351,4800,4857. The player's own attack path, Combat:DoAttack (line 1060), pushes `onattackother` / `onmissother`, NEVER calls SetTarget, so attacking does not fire newcombattarget on the attacker. And all non-nil `combat:SetTarget(player)` calls in the codebase (kramped.lua:152, altar_prototyper, chessjunk, chesspieces, sculptures, chest_terrarium_pigs) set a MOB's target to the player — firing newcombattarget on the MOB, not the player.

CONCLUSION: Registering this as a "player" event (`player_combat_target` listened on the player entity) is a dead listener — it will essentially never fire for players. RECOMMENDATION: skip, unless the feature is re-scoped to mob/NPC aggro tracking (in which case it fires on the mob and is reliable, and you must read data.target/data.oldtarget as keyed fields). The original combat-category framing as a player event should be dropped.
  - **category:** combat
**12.** 
  - **event:** inventory_full
  - **dst_event:** inventoryfull
  - **fires_on:** player
  - **fires_on_detail:** Inventory component owner (the character). self.inst is the player entity that owns components.inventory.
  - **confirmed:** true
  - **needs_debounce:** false
  - **recommendation:** implement
  - **data_fields:** 
    - item
  - **push_site:** components/inventory.lua:1214 -> self.inst:PushEvent("inventoryfull", { item = inst })
  - **notes:** CONFIRMED — issue's claimed source is correct. Exactly one push site exists: components/inventory.lua:1214, `self.inst:PushEvent("inventoryfull", { item = inst })`. Fires on the PLAYER (self.inst = the entity owning the Inventory component = the character). Cross-checked by components/wisecracker.lua:146, which does `inst:ListenForEvent("inventoryfull", ...)` on the character and then reads `inst.components.inventory:IsFull()` — proving the listener entity is the player. DST event string is `inventoryfull` (no underscore); the issue wrote it correctly. Data table has ONE field: `item` (the item entity that could not be placed). The issue's `{item}` == field name `item`. Correct. Server-only: Inventory is a master-sim component, so the listener belongs on the server (the mod's server-side listener will fire; a client-side one would not, since the client has no inventory component). NOT per-tick, so no debounce needed. GOTCHA on semantics: this is gated by `shouldwisecrack and not (self.isloading or self.silentfull) and self.maxslots > 0` in GiveItem — it fires when an item is REJECTED because the inventory has no room (typically then dropped), i.e. an item-could-not-be-stored event, NOT a generic "inventory just reached full capacity" transition. It also won't fire during loading or for silent-full paths. Register the listener on each player entity (player_spawn) for `inventoryfull`; read data.item (the item prefab/entity). To get the item name, GetDisplayName/prefab off data.item.
  - **category:** inventory
**13.** 
  - **event:** trade_received
  - **dst_event:** trade
  - **fires_on:** other
  - **fires_on_detail:** Trader component host (self.inst) = the trade TARGET/receiver (NPC or structure), e.g. pigking, wormwood, birdcage, beefalo, telebase. The player is data.giver, not the event entity.
  - **confirmed:** false
  - **needs_debounce:** false
  - **recommendation:** skip
  - **data_fields:** 
    - giver
    - item
  - **push_site:** components/trader.lua:155: self.inst:PushEvent("trade", { giver = giver, item = item })
  - **notes:** CORRECTIONS to the issue. (1) Event STRING is "trade", not "trade_received" — "trade_received" appears nowhere in vanilla scripts. (2) The issue's claimed source file/component (trader.lua) is RIGHT, but its reasoning is wrong. The event does NOT fire on the player. It fires on self.inst of the Trader component — the entity RECEIVING the gift (the NPC/structure: Pig King, Wormwood, Bird Cage, Beefalo). The PLAYER is data.giver. Only one vanilla listener exists and it's on a structure (prefabs/telebase.lua:122 ListenForEvent("trade")). (3) DSTP registers all inventory listeners via player:ListenForEvent(...) (DST_MOD/scripts/dstp/events/inventory.lua, M.RegisterForPlayer). Registering "trade" there would be a DEAD LISTENER (audit bug #5/#6 class) — the player never gets a "trade" event. (4) The audit's stated reason ("covered by player_item_get") is also inaccurate: in AcceptGift (trader.lua:147) the item goes into the NPC's inventory, so the GIVING player gets NO itemget/gotnewitem event from a trade — there is no player-side push at all (verified: no PushEvent on giver; "giftreceiverupdate" on player_classified is the unrelated Klei-gifting icon system, not item trading). Data table fields are exactly { giver=<player>, item=<entity> }. RECOMMENDATION: SKIP — but for the correct reason: not because it duplicates player_item_get, but because the only clean push site fires on the NPC/trade-target, not on the player, so a player-scoped listener can't capture it. Capturing it would require attaching a "trade" listener to every Trader-bearing prefab (broad PrefabPostInit), which the inventory category's player-centric model doesn't support — not worth it for medium/low value.
  - **category:** inventory
**14.** 
  - **event:** recipe_unlocked
  - **dst_event:** unlockrecipe
  - **fires_on:** player
  - **fires_on_detail:** The builder component is added to the player (player_common.lua:2785 inst:AddComponent("builder")), so self.inst in builder.lua is the player entity. Listen on the player.
  - **confirmed:** true
  - **needs_debounce:** false
  - **push_site:** DST_MOD/specs source: /tmp/dstscripts/scripts/components/builder.lua:468  ->  self.inst:PushEvent("unlockrecipe", { recipe = recname })
  - **data_fields:** 
    - recipe
  - **recommendation:** implement
  - **notes:** CONFIRMED with a correction to the issue's wording. Real call site: components/builder.lua:468 -> self.inst:PushEvent("unlockrecipe", { recipe = recname }). self.inst is the PLAYER (builder is AddComponent'd onto the player at player_common.lua:2785). Event string is lowercase "unlockrecipe" (NO underscore). Data table has ONE named field: recipe = the recipe name string (e.g. "spear"), NOT a positional {recipe}. The issue wrote `player:PushEvent("unlockrecipe", {recipe})` which is right in spirit (player entity, recipe data) but should be `{ recipe = recname }`.

DEAD-LISTENER / GOTCHA #1 — two OTHER push sites fire "unlockrecipe" with NO data table (recipe will be nil): builder.lua:139 (Builder:GiveAllRecipes / freebuild toggle) and prefabs/player_classified.lua:579 (OnRecipesDirty, client-replica refresh). The listener MUST null-guard: `if data ~= nil and data.recipe ~= nil then ...`. This is exactly what vanilla components/playermetrics.lua does (ListenForEvent("unlockrecipe", OnUnlockRecipe) on the player, reads data.recipe) — that is the canonical pattern to copy and it validates the field name.

GOTCHA #2 — server vs client: DSTP runs server-side (master sim, real components). The builder.lua:468 push fires on the master-sim player entity, which IS reachable server-side. The player_classified.lua:579 push is the client-side replication refresh and carries no data; on a dedicated server only the builder.lua site delivers the recipe. Register the listener on the player entity (e.g. in a player-spawn hook) listening for "unlockrecipe" and read data.recipe. No debounce needed (fires once per recipe unlock), but guard against the data-less pushes.
  - **category:** crafting
**15.** 
  - **event:** tech_tree_changed
  - **dst_event:** techtreechange
  - **fires_on:** player
  - **fires_on_detail:** The player entity. Server-side: pushed from the Builder component (self.inst = player). Client-side mirror: pushed on inst._parent (parent of player_classified = player).
  - **confirmed:** true
  - **push_site:** components/builder.lua:414 — self.inst:PushEvent("techtreechange", { level = self.accessible_tech_trees }) ; also prefabs/player_classified.lua:567 — inst._parent:PushEvent("techtreechange", { level = inst.techtrees })
  - **data_fields:** 
    - level
  - **needs_debounce:** false
  - **recommendation:** implement
  - **notes:** CLAIM IS CORRECT but with two important corrections.

1) EVENT STRING: the real DST event is "techtreechange" (one word, present tense) — NOT "tech_tree_changed". Listen with ListenForEvent("techtreechange", fn, player).

2) DATA SHAPE: the issue writes the data as "{level}" implying level is a single scalar number. It is NOT. The data table is { level = <table> } where the value is a MAP of tech-tree name -> numeric level, e.g. { SCIENCE=2, MAGIC=0, ANCIENT=0, CELESTIAL=0, SHADOW=0, SEAFARING=1, ... }. The keys come from techtree.lua AVAILABLE_TECH (SCIENCE, MAGIC, ANCIENT, CELESTIAL, SHADOW, CARTOGRAPHY, SEAFARING, SCULPTING, and many OFFERING/CRAFT entries). So data.level.SCIENCE etc. — a flow reading {{trigger.level}} will get an object, not a number. Surface specific trees (e.g. data.level.SCIENCE) or stringify.

FIRES ON: the player. Server push is components/builder.lua:414 where self.inst is the player (Builder component lives on the player). Client mirror is prefabs/player_classified.lua:567 (inst._parent = player). Builder is a SERVER-only component (clients have replica, not components), so the authoritative push is the server one — fine for DSTP since the mod's server-side listeners are where this matters. NOT a dead listener: real push sites exist on the player.

DEBOUNCE: not needed. Although Builder:EvaluateTechTrees() runs every frame via Builder:OnUpdate(), the PushEvent at line 414 is edge-guarded by `if trees_changed` — it only fires when the accessible tech-tree map actually changes (player enters/leaves a prototyper's range, learns a tech, etc.). So the source already debounces; the listener fires only on real transitions, not per-tick.

CATEGORY: target category "crafting" is reasonable (it is tech/prototyper-driven, sibling to player_craft/player_build).
  - **category:** crafting
**16.** 
  - **event:** player_enlightened
  - **dst_event:** goenlightened
  - **fires_on:** player
  - **fires_on_detail:** Sanity component (added to the player at prefabs/player_common.lua:2781 via inst:AddComponent("sanity")). self.inst == the player.
  - **confirmed:** true
  - **push_site:** self.inst:PushEvent("goenlightened") — components/sanity.lua:429
  - **event_data_shape:** none — PushEvent is called with no data table (no second argument). The handler receives only inst (the player).
  - **data_fields:** _(empty)_
  - **needs_debounce:** false
  - **recommendation:** implement
  - **notes:** Issue's claimed source is CORRECT. components/sanity.lua line 429 (matches the claimed "429"): `self.inst:PushEvent("goenlightened")` — pushed inside Sanity:DoDelta when crossing into lunacy (self.mode == SANITY_MODE_LUNACY and not sane). It is the lunacy counterpart of `goinsane`. KEY CORRECTION TO ANY ASSUMED DATA SHAPE: there is NO data table. The event is pushed with no second arg, so there are zero data fields — the listener must derive userid/name from the captured player itself, exactly like the existing goinsane->player_insane listener does. Fires ON the PLAYER (server master sim): the Sanity component lives on the player (player_common.lua:2781, inside the master-sim block), and vanilla listeners confirm it — dynamicmusic.lua:727 and playerhud.lua:927 both ListenForEvent("goenlightened", ..., player/self.owner). Register exactly like the existing survival listeners in DST_MOD/scripts/dstp/events/survival.lua: player:ListenForEvent("goenlightened", function(inst) ... DSTP.PushEvent("player_enlightened", { userid = uid, name = pname }, inst) end) gated on evt_config.survival. NO debounce needed: it is an edge-triggered state transition (sane->enlightened), guarded by `self:IsSane() ~= self._oldissane`, not per-tick — same cadence as goinsane/gosane which are already shipped without debounce. Note: a goenlightened is ALSO pushed client-side from sanity_replica.lua (OnIsSaneDirty / OnModeDirty), but the mod's survival listeners run server-side on the player and rely on the sanity.lua:429 master-sim push, which is the correct source.
  - **category:** survival
**17.** 
  - **event:** player_lunacy_normal
  - **dst_event:** sanitymodechanged
  - **fires_on:** player
  - **fires_on_detail:** sanity component on the player (master sim); a parallel push exists on sanity_replica on the client
  - **confirmed:** true
  - **needs_debounce:** false
  - **data_fields:** 
    - mode
  - **push_site:** components/sanity.lua:179: self.inst:PushEvent("sanitymodechanged", { mode = self.mode })
  - **recommendation:** implement
  - **notes:** Issue's claimed source is CORRECT (with a wording nit). The exact server push is components/sanity.lua:179 inside Sanity:UpdateMode_Internal(): self.inst:PushEvent("sanitymodechanged", { mode = self.mode }). It fires on the PLAYER (sanity component added at prefabs/player_common.lua:2781). Single data field: `mode`.

CRITICAL gotcha — there is no separate "normal" event and no SANITY_MODE_NORMAL constant. `sanitymodechanged` covers BOTH transitions and `mode` is a NUMBER on the server: SANITY_MODE_INSANITY = 0 (constants.lua:1226) and SANITY_MODE_LUNACY = 1 (constants.lua:1227). So "player_lunacy_normal" = mode == 0 (lunacy turned OFF / back to normal insanity-mode), and the lunacy-ON case is mode == 1. A single ListenForEvent("sanitymodechanged", ...) catches both; the handler MUST branch on data.mode to emit lunacy vs normal. This is edge-detection on the value, not a debounce.

DATA-SHAPE MISMATCH between server and client (this is the dead-listener trap): the mod's client.lua listens on the CLIENT, where the parallel push is at components/sanity_replica.lua:49: inst:PushEvent("sanitymodechanged", {mode = self._oldisinsanitymode}). There `mode` is a BOOLEAN (_oldisinsanitymode: true = insanity/normal, false = lunacy), NOT the numeric 0/1 of the server. If you listen client-side, test `data.mode == true` (normal) vs `data.mode == false` (lunacy); if server-side, test `data.mode == 0` vs `== 1`. Listening client-side and comparing to 0/1 (or vice-versa) = dead branch.

Frequency: safe. Both push sites are already edge-guarded (server: `if self.mode ~= mode`; replica: old/new compare), so it only fires on an actual mode flip — no per-tick spam, no debounce needed.

Lunacy is driven by sources: lunacyhat, lunar/moonstorm/rift areas, alterguardian rift, wagpunk arena, lunacyarea (see prefabs/player_common.lua:584-605, hats.lua, alterguardian_phase4_lunarrift.lua). So in practice this fires when a player enters/leaves a lunar zone or equips/removes the enlightenment crown.
  - **category:** survival
**18.** 
  - **event:** player_wet
  - **dst_event:** moisturedelta
  - **fires_on:** player
  - **fires_on_detail:** moisture component on the player (added in master_postinit of prefabs/player_common.lua); same component also exists on dragonfly, so a player-scoped listener is correct
  - **confirmed:** true
  - **needs_debounce:** true
  - **data_fields:** 
    - old
    - new
  - **push_site:** components/moisture.lua:146 — self.inst:PushEvent("moisturedelta", { old = oldLevel, new = self.moisture })
  - **recommendation:** implement_with_debounce
  - **notes:** Claimed source is CORRECT. Event string is "moisturedelta" (DSTP-internal name "player_wet"). Fires ON THE PLAYER: self.inst:PushEvent, and the moisture component is added to the player in prefabs/player_common.lua:2747 inside the master_postinit (server-side) block, so it fires on the master sim where DSTP listens — a player-scoped listener WILL fire.

Data table: { old = <number>, new = <number> } — both are absolute moisture LEVELS (raw moisture value, NOT segments, NOT a delta). Note the issue's ordering "{old, new}" is right but these are named keys, not array indices: data.old / data.new.

Two push sites, BOTH fire on self.inst (player):
  - components/moisture.lua:146 in Moisture:DoDelta — { old = oldLevel, new = self.moisture }
  - components/moisture.lua:156 in Moisture:SetMoistureLevel — { old = self.moisture, new = self.moisture } (here old==new because it sets moisture before pushing; a SetMoistureLevel call yields old==new, so don't rely on old!=new to detect change).

DEBOUNCE REQUIRED: DoDelta is driven by the moisture OnUpdate loop, so during rain (wetting) or drying it fires repeatedly (effectively per moisture tick), exactly like health/hunger/sanity deltas which DSTP already debounces in the 'health' category. Recommend the same debounce/coalescing. To detect crossing into 'wet' (the meaningful state), compare segments via GetSegs (wet = segs >= 2) rather than raw level, or expose a derived 'is now wet' boolean rather than firing on every tiny moisture delta. The component also tracks self.wet (true when newSegs >= 2) at the time of the push.
  - **category:** survival
