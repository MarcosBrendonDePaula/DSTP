# Entity/world events sweep (raw)

> Saved from workflow `Catalog DST entity/world events we could turn into DSTP trigger nodes`. Raw multi-agent research output;
> see the sibling specs for the distilled conclusions.

## sweeps

**1.** 
  - **summary:** Domain: MOBS & CREATURES. Searched /tmp/dstscripts/scripts/components/ and prefabs/ for entity-level (non-player) events fired on mobs/creatures. Key findings, grouped by usefulness:

CRITICAL NOTE on death/spawn: A creature dying is NOT a new event — the `health.lua` death already fires the WORLD-level `entity_death` (TheWorld) AND the per-entity `death` event. DSTP already consumes `entity_death` for boss_killed/structure_burnt. The right way to expose "any creature died" is to filter `entity_death` by `data.inst.prefab` (e.g. prefab=="beefalo") rather than hooking each mob's `death`. There is NO generic per-creature "spawn/born" PushEvent in vanilla — mobs are created via SpawnPrefab with no PushEvent, so "creature spawned" must be detected via AddPrefabPostInit (hook the prefab's constructor), not a listenable event. childspawner fires `childgoinghome`/`goinghome` (child returns to nest) but not a birth event.

HIGH-VALUE creature events worth exposing as trigger nodes (all fire on the MOB entity, hookable via AddComponentPostInit on the component):
- domesticated / goneferal (domesticatable.lua) — beefalo TAMED / went feral. Clear admin/automation value ("creature tamed").
- transformwere / transformnormal (werebeast.lua) — were-creature transform (werepig, etc.).
- mutate (spidermutator.lua), mutated (merm.lua prefab) — creature mutation.
- trade (trader.lua) — creature BEFRIENDED via feeding (pig/bunnyman gift, give item to a critter). The vanilla befriend mechanic is trader-based.
- freeze / unfreeze / onthaw (freezable.lua) — mob frozen/thawed.
- startstarving / stopstarving (hunger.lua) — non-player creature (e.g. beefalo) getting hungry.

MEDIUM: gotosleep/onwakeup (sleeper.lua), startfollowing/stopfollowing (leader.lua), gainloyalty/loseloyalty/leaderchanged (follower.lua), beingridden/riderchanged/bucked (rideable.lua), domesticationdelta/obediencedelta (domesticatable.lua), knockback (joustsource/sharkboi), onburnt (burnable.lua, mob burned to death), transform (dragonfly fire/normal).

LOW/noise: newcombattarget (already used by DSTP for mob-aggro), attacked/onattackother/doattack (combat per-hit, server-only, very noisy), losttarget/droppedtarget/giveuptarget, healthdelta (per-tick), startfiredamage/firedamage, on_loot_dropped/loot_prefab_spawned (per-loot-item spam), flee/fleewarning (only beequeen/toadstool brains push these — not generic).
  - **events:** 
    **1.** 
      - **event:** domesticated
      - **firesOn:** the mob (e.g. beefalo) — inst with domesticatable component
      - **data:** { tendencies = table } (the beefalo's tendency map: ornery/pudgy/docile)
      - **source:** components/domesticatable.lua:91 (Domesticatable:BecomeDomesticated)
      - **useful:** high
    **2.** 
      - **event:** goneferal
      - **firesOn:** the mob with domesticatable component (beefalo)
      - **data:** { domesticated = bool } (was it domesticated before going feral)
      - **source:** components/domesticatable.lua:81 (Domesticatable:CheckForChanges, on starvation/0 domestication)
      - **useful:** high
    **3.** 
      - **event:** trade
      - **firesOn:** the creature/NPC with a trader component (pig, bunnyman, critter, moon trader) — i.e. a mob BEFRIENDED/fed
      - **data:** { giver = entity (usually the player), item = entity (item given) }
      - **source:** components/trader.lua:155 (Trader:AcceptGift)
      - **useful:** high
    **4.** 
      - **event:** transformwere
      - **firesOn:** the were-creature (werepig, etc.) with werebeast component
      - **data:** none (no payload)
      - **source:** components/werebeast.lua:121 (WereBeast:SetWere)
      - **useful:** high
    **5.** 
      - **event:** transformnormal
      - **firesOn:** the were-creature reverting to normal form
      - **data:** none
      - **source:** components/werebeast.lua:138 (WereBeast:SetNormal)
      - **useful:** high
    **6.** 
      - **event:** mutate
      - **firesOn:** the spider being mutated into a variant (gland/water/moon/etc spider)
      - **data:** none (mutation target stored on spider.mutation_target / spider.mutator_giver before push)
      - **source:** components/spidermutator.lua:31 (SpiderMutator give logic)
      - **useful:** high
    **7.** 
      - **event:** freeze
      - **firesOn:** any mob/entity with freezable component (creature frozen solid)
      - **data:** none
      - **source:** components/freezable.lua:272 (Freezable:Freeze)
      - **useful:** high
    **8.** 
      - **event:** unfreeze
      - **firesOn:** frozen mob breaking free
      - **data:** none
      - **source:** components/freezable.lua:291 (Freezable:Unfreeze)
      - **useful:** medium
    **9.** 
      - **event:** onthaw
      - **firesOn:** mob thawing out of frozen state
      - **data:** none
      - **source:** components/freezable.lua:305 (Freezable:Thaw)
      - **useful:** low
    **10.** 
      - **event:** startstarving
      - **firesOn:** any creature with hunger (e.g. beefalo) — NON-player; hunger.lua is shared but mobs use it too
      - **data:** none
      - **source:** components/hunger.lua:118 (Hunger:DoDec when hunger hits 0)
      - **useful:** high
    **11.** 
      - **event:** stopstarving
      - **firesOn:** creature with hunger that got fed above 0
      - **data:** none
      - **source:** components/hunger.lua:123 (Hunger:DoDec)
      - **useful:** medium
    **12.** 
      - **event:** death
      - **firesOn:** the dying entity (mob OR player) — per-entity death. For mobs, prefer filtering the WORLD entity_death by prefab instead
      - **data:** { cause = string, afflicter = entity (killer), corpsing = bool }
      - **source:** components/health.lua:590 (Health:SetVal, currenthealth<=0)
      - **useful:** high
    **13.** 
      - **event:** entity_death
      - **firesOn:** TheWorld (NOT the mob) — fires for EVERY creature/structure death; filter by data.inst.prefab. Already consumed by DSTP for boss_killed
      - **data:** { inst = entity (the dead mob), cause = string, afflicter = entity (killer), corpsing = bool }
      - **source:** components/health.lua:589 (Health:SetVal)
      - **useful:** high
    **14.** 
      - **event:** onburnt
      - **firesOn:** any flammable mob/entity that finished burning (creature burned to death/ash)
      - **data:** none
      - **source:** components/burnable.lua:295 (internal onburnt handler)
      - **useful:** medium
    **15.** 
      - **event:** gotosleep
      - **firesOn:** any mob with sleeper component (e.g. mobs sleeping at night, hibernation)
      - **data:** none
      - **source:** components/sleeper.lua:300 (Sleeper:GoToSleep)
      - **useful:** medium
    **16.** 
      - **event:** onwakeup
      - **firesOn:** sleeping mob waking up
      - **data:** none
      - **source:** components/sleeper.lua:332 (Sleeper:WakeUp)
      - **useful:** medium
    **17.** 
      - **event:** startfollowing
      - **firesOn:** the follower mob (Chester, pig, critter) when it starts following a leader
      - **data:** { leader = entity }
      - **source:** components/leader.lua:194 (Leader:AddFollower)
      - **useful:** medium
    **18.** 
      - **event:** stopfollowing
      - **firesOn:** the follower mob when it stops following
      - **data:** { leader = entity }
      - **source:** components/leader.lua:183 (Leader:RemoveFollower)
      - **useful:** medium
    **19.** 
      - **event:** leaderchanged
      - **firesOn:** the follower mob when its leader changes
      - **data:** { new = entity (new leader), old = entity (prev leader) }
      - **source:** components/follower.lua:349 (Follower:SetLeader)
      - **useful:** medium
    **20.** 
      - **event:** gainloyalty
      - **firesOn:** the follower mob (e.g. pig fed meat) gaining loyalty time
      - **data:** { leader = entity }
      - **source:** components/follower.lua:382 (Follower:AddLoyaltyTime)
      - **useful:** medium
    **21.** 
      - **event:** loseloyalty
      - **firesOn:** the follower mob losing all loyalty (stops being a follower)
      - **data:** { leader = entity }
      - **source:** components/follower.lua:407 (Follower:LoyaltyExpired)
      - **useful:** medium
    **22.** 
      - **event:** riderchanged
      - **firesOn:** the rideable mob (beefalo/woby) when mounted/dismounted
      - **data:** { oldrider = entity, newrider = entity }
      - **source:** components/rideable.lua:190 (Rideable:SetRider)
      - **useful:** medium
    **23.** 
      - **event:** bucked
      - **firesOn:** the RIDER (player) thrown off a rideable mob — fires on rider, mob is self
      - **data:** { gentle = bool }
      - **source:** components/rideable.lua:203 (Rideable:Buck)
      - **useful:** low
    **24.** 
      - **event:** saddlechanged
      - **firesOn:** the rideable mob (beefalo) gaining/losing a saddle
      - **data:** { saddle = entity|nil }
      - **source:** components/rideable.lua:133,142 (Rideable:SetSaddle)
      - **useful:** low
    **25.** 
      - **event:** domesticationdelta
      - **firesOn:** the beefalo as domestication % changes (progress tick toward taming)
      - **data:** { old = number, new = number }
      - **source:** components/domesticatable.lua:131 (DoDeltaDomestication)
      - **useful:** medium
    **26.** 
      - **event:** obediencedelta
      - **firesOn:** the beefalo as obedience changes
      - **data:** { old = number, new = number }
      - **source:** components/domesticatable.lua:105 (DoDeltaObedience)
      - **useful:** low
    **27.** 
      - **event:** knockback
      - **firesOn:** a mob/entity being knocked back (joust source, sharkboi punt, etc.)
      - **data:** { knocker = entity, radius = number, forcelanded = bool } (varies by source)
      - **source:** components/joustsource.lua:120 (also sharkboimanager.lua:435)
      - **useful:** low
    **28.** 
      - **event:** newcombattarget
      - **firesOn:** any mob with combat when it acquires a target (mob aggro). ALREADY used by DSTP
      - **data:** { target = entity, oldtarget = entity }
      - **source:** components/combat.lua:385 (Combat:SetTarget)
      - **useful:** low
    **29.** 
      - **event:** attacked
      - **firesOn:** any mob being hit (server-only). Very noisy per-hit
      - **data:** { attacker = entity, damage = number, damageresolved = number, original_damage = number, weapon = entity, stimuli, spdamage, redirected }
      - **source:** components/combat.lua:686 (Combat:GetAttacked)
      - **useful:** low
    **30.** 
      - **event:** onattackother
      - **firesOn:** a mob when IT attacks something (server-only, noisy)
      - **data:** { target = entity, weapon = entity, projectile, stimuli }
      - **source:** components/combat.lua:1106 (Combat:DoAttack)
      - **useful:** low
    **31.** 
      - **event:** killed
      - **firesOn:** the attacker mob when its victim dies from the hit
      - **data:** { victim = entity, attacker = entity }
      - **source:** components/combat.lua:652 (Combat:GetAttacked, victim death)
      - **useful:** low
    **32.** 
      - **event:** childgoinghome
      - **firesOn:** the spawner/nest (childspawner) when a child returns home
      - **data:** { child = entity }
      - **source:** components/childspawner.lua:669 (ChildSpawner:GoHomeChild)
      - **useful:** low
    **33.** 
      - **event:** mutated
      - **firesOn:** a merm being converted to lunar/gestalt merm (prefab-level transform)
      - **data:** { oldbuild = string }
      - **source:** prefabs/merm.lua:801
      - **useful:** medium
    **34.** 
      - **event:** transform
      - **firesOn:** dragonfly switching between normal and fire/enraged state
      - **data:** { transformstate = string ("normal"|"fire") }
      - **source:** prefabs/dragonfly.lua:157,351,436
      - **useful:** medium
**2.** 
  - **summary:** STRUCTURES & WORKABLES domain — entity/world events DST fires on non-player structures/workables that DSTP could expose as new trigger nodes (hooked via AddComponentPostInit + ListenForEvent on every entity of that component type, same pattern as the existing combat/trader hooks). All file:line refs are in /tmp/dstscripts/scripts/components/.

KEY FINDINGS:
- onbuilt (builder.lua:820) fires on the NEWLY BUILT STRUCTURE itself, carrying {builder, pos} — this is the proper "a structure was built" entity event (the existing buildstructure fires on the PLAYER; onbuilt fires on the structure). HIGH value, the headline missing event.
- worked / workfinished (workable.lua:149,165) fire ON THE STRUCTURE/RESOURCE being worked (tree, wall, chest, boulder). DSTP currently only listens to the player-side "working"/"finishedwork"; the structure-side worked/workfinished give per-object "this wall was hammered N times / this tree was chopped down" with {worker, workleft}. HIGH for anti-grief / resource tracking.
- onignite / onextinguish / onburnt (burnable.lua:375,492,295) fire on the burning OBJECT. onburnt = structure/resource fully consumed by fire; the existing structure_burnt is detected world-side, these are the direct entity events. onignite{source,doer} catches the arsonist. HIGH.
- onopen / onclose (container.lua:656,719) {doer} fire on the CONTAINER (chest, icebox, etc) when ANYONE opens/closes it. The existing onopencontainer/onclosecontainer fire on the player; these fire on the chest, so you know WHICH chest. HIGH anti-grief (chest looting).
- itemget / itemlose (container.lua:538,1047) {slot,item} — item added/removed from a container by anyone. HIGH for chest-audit flows.

IMPORTANT NEGATIVE FINDINGS (NOT directly listenable — they use callback fns, NOT PushEvent, so they need an override not a ListenForEvent): crop matured (crop.lua onmatured fn), tree/plant growth stages (growable.lua growfn/pregrowfn), beebox/mushroom-planter ready (harvestable.lua onharvestfn/ongrow), repaired (repairable.lua onrepaired fn), construction finished (constructionsite.lua onconstructedfn fn), crock-pot/drying-rack done (stewer/dryer use sectionfn/callbacks). Crop/grow/repair/construct events would require overriding those Set*Fn callbacks (mechanic-module style), not a simple event hook.

Medium/low extras: percentusedchange & onfueldsectionchanged (fueled.lua/finiteuses.lua) for fuel/durability thresholds; springtrap/trapped (trap.lua); machineturnedon/off (machine.lua — flingomatic/lightning rod toggle); onactivated (activatable.lua); deployable itemplanted (world-scoped); unwrapped (unwrappable.lua, bundle opened).
  - **events:** 
    **1.** 
      - **event:** onbuilt
      - **firesOn:** the newly built structure (prod) itself
      - **data:** { builder = <player inst>, pos = <Vector3 placement point> }
      - **source:** components/builder.lua:820
      - **useful:** high
    **2.** 
      - **event:** worked
      - **firesOn:** the structure/resource being worked (tree, wall, chest, boulder, mineable)
      - **data:** { worker = <doer inst>, workleft = <number remaining work units> }
      - **source:** components/workable.lua:149
      - **useful:** high
    **3.** 
      - **event:** workfinished
      - **firesOn:** the structure/resource when its work hits 0 (wall hammered down, tree felled, rock mined out)
      - **data:** { worker = <doer inst> }
      - **source:** components/workable.lua:165
      - **useful:** high
    **4.** 
      - **event:** onburnt
      - **firesOn:** the burning object (structure/resource) when fire fully consumes it
      - **data:** {} (no fields)
      - **source:** components/burnable.lua:295
      - **useful:** high
    **5.** 
      - **event:** onignite
      - **firesOn:** the object that just caught fire
      - **data:** { source = <fire source inst>, doer = <igniter inst, may be nil> }
      - **source:** components/burnable.lua:375
      - **useful:** high
    **6.** 
      - **event:** onextinguish
      - **firesOn:** the object whose fire was put out
      - **data:** {} (no fields)
      - **source:** components/burnable.lua:492
      - **useful:** medium
    **7.** 
      - **event:** onopen
      - **firesOn:** the container (chest/icebox/etc) when anyone opens it
      - **data:** { doer = <player inst opening it> }
      - **source:** components/container.lua:656
      - **useful:** high
    **8.** 
      - **event:** onclose
      - **firesOn:** the container when anyone closes it
      - **data:** { doer = <player inst closing it> }
      - **source:** components/container.lua:719
      - **useful:** high
    **9.** 
      - **event:** itemget
      - **firesOn:** the container when an item is placed into it
      - **data:** { slot = <slot index>, item = <item inst>, src_pos = <source pos, optional> }
      - **source:** components/container.lua:538
      - **useful:** high
    **10.** 
      - **event:** itemlose
      - **firesOn:** the container when an item is removed from it
      - **data:** { slot = <slot index>, prev_item = <item inst> }
      - **source:** components/container.lua:1047
      - **useful:** high
    **11.** 
      - **event:** onfueldsectionchanged
      - **firesOn:** the fueled structure/item (campfire, lantern, flingomatic) when its fuel section crosses a threshold
      - **data:** { newsection = <int>, oldsection = <int>, doer = <refueler inst, only on DoDelta> }
      - **source:** components/fueled.lua:301 (and :316 with doer)
      - **useful:** medium
    **12.** 
      - **event:** percentusedchange
      - **firesOn:** the fueled/finiteuses object on every fuel/durability change (campfire dying down, tool wearing out)
      - **data:** { percent = <0..1 remaining> }
      - **source:** components/fueled.lua:322 and components/finiteuses.lua:61
      - **useful:** medium
    **13.** 
      - **event:** springtrap
      - **firesOn:** the trap when it triggers/springs
      - **data:** {} on trigger; { loading = true } when set (trap.lua:479)
      - **source:** components/trap.lua:195
      - **useful:** medium
    **14.** 
      - **event:** trapped
      - **firesOn:** the creature caught by the trap (fires on the victim, a mob — not a player)
      - **data:** { trap = <trap inst> }
      - **source:** components/trap.lua:197
      - **useful:** medium
    **15.** 
      - **event:** machineturnedon
      - **firesOn:** the machine structure (flingomatic, lightning rod conductor, gear-driven devices) when toggled on
      - **data:** {} (no fields)
      - **source:** components/machine.lua:92
      - **useful:** medium
    **16.** 
      - **event:** machineturnedoff
      - **firesOn:** the machine structure when toggled off (e.g. flingomatic out of fuel / switched off)
      - **data:** {} (no fields)
      - **source:** components/machine.lua:111
      - **useful:** medium
    **17.** 
      - **event:** onactivated
      - **firesOn:** the activatable world object (ancient gateway, terrarium, things activated by hand)
      - **data:** { doer = <player inst> }
      - **source:** components/activatable.lua:66
      - **useful:** medium
    **18.** 
      - **event:** itemplanted
      - **firesOn:** TheWorld (world-scoped) when a deployable item is deployed/planted (saplings, structures, traps placed)
      - **data:** { doer = <deployer inst>, pos = <Vector3 plant point> }
      - **source:** components/deployable.lua:144
      - **useful:** medium
    **19.** 
      - **event:** unwrapped
      - **firesOn:** the bundle/wrap object when it is unwrapped (gift/bundle opened)
      - **data:** { doer = <player inst> }
      - **source:** components/unwrappable.lua:134
      - **useful:** low
    **20.** 
      - **event:** harvesttrap
      - **firesOn:** the trap when harvested or when its catch starves
      - **data:** { doer = <player inst> } on harvest (:356); { sprung = true } on starve (:215)
      - **source:** components/trap.lua:356
      - **useful:** low
    **21.** 
      - **event:** dropitem
      - **firesOn:** the container when it force-drops an item (e.g. on burn/destroy)
      - **data:** { item = <item inst> }
      - **source:** components/container.lua:139 and :264
      - **useful:** low
**3.** 
  - **summary:** Surveyed the WORLD & SHARD systems in /tmp/dstscripts/scripts (clock, seasons, weather, the storm managers, the boss/raid spawners, riftspawner, wildfires, and shard_* components). Key finding: most events that fire on TheWorld are notifications of world-state changes (phase, moon phase, season, storms, rifts, day-rollover) and are excellent admin/automation triggers. Important nuance for the orchestrator: the seasonal-giant spawners (deerclops/bearger/klaus/malbatross/crabking/daywalker) do NOT push a "boss spawned" world event — they call SpawnPrefab directly, so a spawn must be detected via entity_death-style hooks or via the existing entity hook, NOT a world PushEvent. The detectable raid-incoming signals are houndwarning (hound wave, fires per-player) and the storm/rift/season/phase world events. STORM events are unified: sandstorm AND moonstorm both push ms_stormchanged on TheWorld with {stormtype, setting} — one trigger covers both. The strongest high-value world triggers: ms_stormchanged (sandstorm/moonstorm start/end), ms_riftaddedtopool / ms_riftremovedfrompool (lunar+shadow rift opened/closed), phasechanged (day/dusk/night), moonphasechanged2 (full-moon → werebeaver/insanity raids), seasontick (season change carries season name), ms_cyclecomplete/cycleschanged (new day rollover), precipitationchanged (rain/snow start), houndwarning (hound wave incoming), nightmarephasechanged (ruins nightmare cycle), timerdone (generic worldsettings raid-timer fired). All TheWorld events also reach the master/secondary shard split (master_clockupdate/seasonsupdate vs secondary_*).
  - **events:** 
    **1.** 
      - **event:** ms_stormchanged
      - **firesOn:** TheWorld (sandstorm pushes on 'inst' = the sandstorms world-component owner = TheWorld; moonstorm pushes on TheWorld)
      - **data:** { stormtype = STORM_TYPES.SANDSTORM|MOONSTORM (1|2), setting = bool (true=active/started, false=ended) }
      - **source:** components/sandstorms.lua:33 (sandstorm start/end) and components/moonstorms.lua:126,132 + components/moonstormmanager start (moonstorm start/end)
      - **useful:** high
    **2.** 
      - **event:** ms_riftaddedtopool
      - **firesOn:** TheWorld
      - **data:** { rift = <rift entity> } (a lunar or shadow rift just opened in the world; rift.prefab distinguishes lunar vs shadow)
      - **source:** components/riftspawner.lua:85
      - **useful:** high
    **3.** 
      - **event:** ms_riftremovedfrompool
      - **firesOn:** TheWorld
      - **data:** { rift = <rift entity> } (a rift closed/was removed)
      - **source:** components/riftspawner.lua:68
      - **useful:** high
    **4.** 
      - **event:** phasechanged
      - **firesOn:** TheWorld (via _world)
      - **data:** PHASE_NAMES[_phase] string: "day" | "dusk" | "night"
      - **source:** components/clock.lua:396
      - **useful:** high
    **5.** 
      - **event:** moonphasechanged2
      - **firesOn:** TheWorld (via _world)
      - **data:** { moonphase = "new"|"quarter"|"half"|"threequarter"|"full", waxing = bool }
      - **source:** components/clock.lua:403 (also moonphasechanged at :402 = name only)
      - **useful:** high
    **6.** 
      - **event:** ms_cyclecomplete
      - **firesOn:** TheWorld (via _world)
      - **data:** cycles:value() = number (the new day index). Fires at the moment a new day begins (phase rolls to day).
      - **source:** components/clock.lua:354
      - **useful:** high
    **7.** 
      - **event:** cycleschanged
      - **firesOn:** TheWorld (via _world)
      - **data:** cycles:value() = number (new day count). Sibling of ms_cyclecomplete; fires when the cycles netvar dirties.
      - **source:** components/clock.lua:391
      - **useful:** high
    **8.** 
      - **event:** seasontick
      - **firesOn:** TheWorld (via _world)
      - **data:** { season = SEASON_NAMES string ("autumn"|"winter"|"spring"|"summer"), progress = 0..1, elapseddaysinseason = n, remainingdaysinseason = n }. Fires whenever season netvar dirties — the season-name change is the season-change signal (DSTP's season_changed derives from comparing this).
      - **source:** components/seasons.lua:248
      - **useful:** high
    **9.** 
      - **event:** precipitationchanged
      - **firesOn:** TheWorld (via _world)
      - **data:** PRECIP_TYPE_NAMES string: "none" | "rain" | "snow" (rain/snow start or stop)
      - **source:** components/weather.lua:778 (listener) / :513 (direct)
      - **useful:** high
    **10.** 
      - **event:** houndwarning
      - **firesOn:** each targeted PLAYER entity (NOT TheWorld) — note this is a per-player warning, not a world event
      - **data:** HOUNDWARNINGTYPE[sound] (a warning-level enum). Signals an incoming hound wave to that player N seconds before it spawns.
      - **source:** components/hounded.lua:862 and :884
      - **useful:** high
    **11.** 
      - **event:** timerdone
      - **firesOn:** the world-component owner instance (TheWorld) running worldsettingstimer — generic raid/spawn countdown dispatcher
      - **data:** { name = string } (timer name, e.g. "malbatross_timetospawn", rift spawn timer, boss respawn timers). This is the underlying scheduling primitive many raids/bosses use; a flow could trigger on a named raid timer firing.
      - **source:** components/worldsettingstimer.lua:58
      - **useful:** high
    **12.** 
      - **event:** nightmarephasechanged
      - **firesOn:** TheWorld (via _world) — caves/ruins only
      - **data:** PHASE_NAMES string for the ruins nightmare cycle: "calm"|"warn"|"wild"|"dawn". Drives shadow-creature spawns in the ruins.
      - **source:** components/nightmareclock.lua:255
      - **useful:** high
    **13.** 
      - **event:** ms_moonstormwindowover
      - **firesOn:** TheWorld
      - **data:** (no payload) — marks the moonstorm event window concluding / the celestial-event staging boundary.
      - **source:** components/moonstorms.lua:127 and components/moonstormmanager.lua:271
      - **useful:** medium
    **14.** 
      - **event:** lightningstrike
      - **firesOn:** the struck entity (closest lightning rod), NOT TheWorld
      - **data:** (no payload) — a lightning bolt (normal or moonstorm_lightning) hit a rod.
      - **source:** components/weather.lua:698
      - **useful:** medium
    **15.** 
      - **event:** seasonlengthschanged
      - **firesOn:** TheWorld (via _world)
      - **data:** { autumn=n, winter=n, spring=n, summer=n } — fires when an admin/worldsetting changes configured season lengths.
      - **source:** components/seasons.lua:260
      - **useful:** medium
    **16.** 
      - **event:** clocksegschanged
      - **firesOn:** TheWorld (via _world)
      - **data:** { day=segs, dusk=segs, night=segs } — day/dusk/night length composition changed (e.g. on season change or moonstorm lock to 16 night segs). Useful as a proxy for special night events.
      - **source:** components/clock.lua:386
      - **useful:** medium
    **17.** 
      - **event:** moonphasestylechanged
      - **firesOn:** TheWorld (via _world)
      - **data:** MOON_PHASE_STYLE_NAMES string (e.g. "default", "alter_active", "glassed_default", "glassed_alter_active") — indicates the Celestial Altar / Alter-Guardian moon corruption state.
      - **source:** components/clock.lua:408
      - **useful:** medium
    **18.** 
      - **event:** toadstoolstatechanged
      - **firesOn:** TheWorld
      - **data:** { spawner = <spawner>, state = <state> } — Toadstool (mushroom boss) spawner state machine changed (e.g. became spawnable/active).
      - **source:** components/toadstoolspawner.lua:70
      - **useful:** medium
    **19.** 
      - **event:** toadstoolkilled
      - **firesOn:** TheWorld
      - **data:** { spawner = <spawner>, toadstool = <ent> } — Toadstool boss killed (a dedicated world signal beyond generic entity_death).
      - **source:** components/toadstoolspawner.lua:80
      - **useful:** medium
    **20.** 
      - **event:** master_clockupdate
      - **firesOn:** TheWorld on the MASTER shard
      - **data:** full clock snapshot (phase, cycles, segs, moonphase…). Master→secondary shard clock sync; pairs with secondary_clockupdate on the cave shard.
      - **source:** components/clock.lua:438 (master) / components/shard_clock.lua:98 (secondary_clockupdate)
      - **useful:** low
    **21.** 
      - **event:** master_seasonsupdate / secondary_seasonsupdate
      - **firesOn:** TheWorld (master pushes master_seasonsupdate; cave/secondary shard pushes secondary_seasonsupdate)
      - **data:** { season, totaldaysinseason, remainingdaysinseason, elapseddaysinseason, endlessdaysinseason, lengths[] } — cross-shard season replication.
      - **source:** components/seasons.lua:234 / components/shard_seasons.lua:93
      - **useful:** low
    **22.** 
      - **event:** weathertick
      - **firesOn:** TheWorld (via _world)
      - **data:** { moisture, pop, precipitationrate, snowlevel, wetness, … } — high-frequency weather sampling. Too noisy as a trigger (fires continuously) but a candidate data source.
      - **source:** components/weather.lua:372 (and :503)
      - **useful:** low
    **23.** 
      - **event:** clocktick / nightmareclocktick / seasontick(progress)
      - **firesOn:** TheWorld (via _world)
      - **data:** clocktick: { phase, timeinphase 0..1, time 0..1 }; nightmareclocktick: { phase, timeinphase, time }. Per-frame-ish ticks — noise, not a trigger; useful only for live HUD progress.
      - **source:** components/clock.lua:422 / components/nightmareclock.lua:270
      - **useful:** low
    **24.** 
      - **event:** ms_lunarriftmutationsmanager_taskcompleted
      - **firesOn:** TheWorld
      - **data:** (no payload) — internal bookkeeping when the lunar-rift mutation manager finishes a task. Internal/noise.
      - **source:** components/lunarriftmutationsmanager.lua:123 and :150
      - **useful:** low
    **25.** 
      - **event:** acidleveldelta
      - **firesOn:** the entity owning the acidlevel component (NOT TheWorld — per-entity acid rain corrosion)
      - **data:** { oldpercent, newpercent } — acid-rain damage accrual on an object. Per-object and frequent; not a world-level 'acid rain started' signal (that is driven by ms_stormchanged/weather, no dedicated start event).
      - **source:** components/acidlevel.lua:275
      - **useful:** low
**4.** 
  - **summary:** ITEMS/ECONOMY/INTERACTIONS domain scan of /tmp/dstscripts/scripts/components. Key findings for NEW entity-hook triggers (fired on a NON-player entity via AddComponentPostInit, the DSTP pattern):

HIGH value, fire on the world OBJECT (good new hooks):
- trader.lua "trade" — already partially used by DSTP (trade_received), but note it fires on the TRADER entity (Pig King, Wickerbottom-book reader, moon altar, etc.), data {giver, item}. The single most economy-relevant interaction event.
- domesticatable.lua "domesticated"/"goneferal" — beefalo taming complete / reverted to feral. Classic "creature tamed" trigger. Fires on the beefalo.
- container.lua "onopen"/"onclose" {doer} and "itemget"/"itemlose" {slot,item,...} — chest/icebox/backpack opened, looted, deposited. Fires on the CONTAINER entity. High for "chest looted" automation. itemget/itemlose fire on every deposit/withdraw (medium-noise but very useful gated).

MEDIUM:
- perishable.lua "perished" — an item (food) fully spoiled. Fires on the ITEM. "perishchange" {percent} is the running spoilage progress (noisy). Note: crockpot SPOILING (stewer) uses perishable too.
- rideable.lua "riderchanged" {oldrider,newrider} — a mount/beefalo gained or lost a rider. Fires on the MOUNT (the non-player half of mounting). Also "saddlechanged","beingridden"(per-tick, noise).
- activatable.lua "onactivated" {doer} — a one-shot activatable object used (e.g. ancient pseudoscience station, things you "activate"). Fires on the object.
- machine.lua "machineturnedon"/"machineturnedoff" — a machine/device toggled (e.g. flingomatic, lightning rod-style). Fires on the machine.
- deployable.lua: TheWorld "itemplanted" {doer,pos} — something planted/deployed in the world (fires on TheWorld, easy to hook globally).
- harvestable.lua "harvestsomething" / pickable.lua "picked" {picker,loot,plant} — "picked"/"picked" fires on the PLANT/bush/grass (non-player), good for "resource node harvested". (harvestsomething/picksomething fire on the picker=player.)

LOW / context-only (fire on the PLAYER, already in DSTP player scope — not new entity hooks):
- fishingrod "fishingcatch"/"fishingcollect" and oceanfishingrod "fishcaught"{fish} fire on the FISHER (player) — useful as a "fishing catch" player event, but not a new entity hook. The rod-side copies (inst:PushEvent on the rod) ARE entity-side and hookable.
- rider.lua "mounted"/"dismounted" fire on the player (rider) — already player scope.
- inventory/inventoryitem equip/unequip/itemget/gotnewitem fire on the player — player scope.

NOTE — cooking-done and drying-done do NOT use PushEvent: stewer.lua signals via the "donecooking" TAG + ondonecooking callback (no event); dryer.lua via the "dried" TAG + ondonedrying callback. To trigger on "crockpot finished"/"dryer finished" you must AddComponentPostInit and wrap the callback (SetDoneDryingFn / ondonecooking) or watch the tag, since there is no PushEvent to listen for.
  - **events:** 
    **1.** 
      - **event:** trade
      - **firesOn:** the trader entity (Pig King, moon altar, Wickerbottom book reader, any NPC/object with a trader component)
      - **data:** { giver = <player who gave>, item = <item entity accepted> }
      - **source:** components/trader.lua:155
      - **useful:** high
    **2.** 
      - **event:** domesticated
      - **firesOn:** the creature being tamed (beefalo)
      - **data:** { tendencies = <table of tendency weights> }
      - **source:** components/domesticatable.lua:91
      - **useful:** high
    **3.** 
      - **event:** goneferal
      - **firesOn:** the creature (beefalo) reverting to wild
      - **data:** { domesticated = <bool, was it domesticated> }
      - **source:** components/domesticatable.lua:81
      - **useful:** medium
    **4.** 
      - **event:** obediencedelta
      - **firesOn:** the beefalo
      - **data:** { old = <number>, new = <number> }
      - **source:** components/domesticatable.lua:105
      - **useful:** low
    **5.** 
      - **event:** domesticationdelta
      - **firesOn:** the beefalo
      - **data:** { old = <number>, new = <number> }
      - **source:** components/domesticatable.lua:131
      - **useful:** low
    **6.** 
      - **event:** onopen
      - **firesOn:** the container entity (chest, icebox, backpack, dragonfly chest, etc.)
      - **data:** { doer = <player who opened it> }
      - **source:** components/container.lua:656
      - **useful:** high
    **7.** 
      - **event:** onclose
      - **firesOn:** the container entity
      - **data:** { doer = <player who closed it> }
      - **source:** components/container.lua:719
      - **useful:** medium
    **8.** 
      - **event:** itemget
      - **firesOn:** the container entity (item deposited into a chest)
      - **data:** { slot = <int>, item = <item entity>, src_pos = <Vector3> }
      - **source:** components/container.lua:538 (also :547)
      - **useful:** high
    **9.** 
      - **event:** itemlose
      - **firesOn:** the container entity (item withdrawn / chest looted)
      - **data:** { slot = <int>, prev_item = <item entity> }
      - **source:** components/container.lua:1047
      - **useful:** high
    **10.** 
      - **event:** dropitem
      - **firesOn:** the container entity (e.g. container destroyed, spilling items)
      - **data:** { item = <item entity> }
      - **source:** components/container.lua:139 (also :264)
      - **useful:** medium
    **11.** 
      - **event:** perished
      - **firesOn:** the item that fully spoiled (food/perishable)
      - **data:** (no payload)
      - **source:** components/perishable.lua:290
      - **useful:** medium
    **12.** 
      - **event:** perishchange
      - **firesOn:** the perishable item (running spoilage progress)
      - **data:** { percent = <0..1 freshness> }
      - **source:** components/perishable.lua:135 (also :176,:185,:229)
      - **useful:** low
    **13.** 
      - **event:** riderchanged
      - **firesOn:** the mount/beefalo (gained or lost a rider)
      - **data:** { oldrider = <entity or nil>, newrider = <entity or nil> }
      - **source:** components/rideable.lua:190
      - **useful:** medium
    **14.** 
      - **event:** saddlechanged
      - **firesOn:** the mount/beefalo
      - **data:** { saddle = <saddle entity or nil> }
      - **source:** components/rideable.lua:133 (also :142)
      - **useful:** low
    **15.** 
      - **event:** onactivated
      - **firesOn:** the activatable object (e.g. ancient pseudoscience station, things you 'activate')
      - **data:** { doer = <player> }
      - **source:** components/activatable.lua:66
      - **useful:** medium
    **16.** 
      - **event:** machineturnedon
      - **firesOn:** the machine/device (flingomatic, etc.)
      - **data:** (no payload)
      - **source:** components/machine.lua:92
      - **useful:** medium
    **17.** 
      - **event:** machineturnedoff
      - **firesOn:** the machine/device
      - **data:** (no payload)
      - **source:** components/machine.lua:111
      - **useful:** medium
    **18.** 
      - **event:** itemplanted
      - **firesOn:** TheWorld (global — easy to hook without per-entity postinit) when a plantable item is deployed
      - **data:** { doer = <player>, pos = <Vector3> }
      - **source:** components/deployable.lua:144
      - **useful:** medium
    **19.** 
      - **event:** picked
      - **firesOn:** the plant/bush/grass/berrybush that was picked (non-player resource node)
      - **data:** { picker = <player>, loot = <table of loot prefabs>, plant = <self> }
      - **source:** components/pickable.lua:575
      - **useful:** medium
    **20.** 
      - **event:** takefuel
      - **firesOn:** the fueled object (campfire/firepit/lantern refueled)
      - **data:** { fuelvalue = <number> }
      - **source:** components/fueled.lua:226
      - **useful:** medium
    **21.** 
      - **event:** onfueldsectionchanged
      - **firesOn:** the fueled object (fire section level changed, e.g. fire dying down)
      - **data:** { newsection = <int>, oldsection = <int>, doer = <player or nil> }
      - **source:** components/fueled.lua:301 (also :316)
      - **useful:** medium
    **22.** 
      - **event:** fishingcatch
      - **firesOn:** the fishing ROD entity (pond fishing landed a fish) — entity-side copy is hookable; a parallel push fires on the fisher/player
      - **data:** { build = <fish anim build string> }
      - **source:** components/fishingrod.lua:181 (rod) / :182 (fisher)
      - **useful:** medium
    **23.** 
      - **event:** fishcaught
      - **firesOn:** the fisher (PLAYER) for ocean fishing — player-scope, no entity-side copy
      - **data:** { fish = <caught fish entity> }
      - **source:** components/oceanfishingrod.lua:355
      - **useful:** medium
    **24.** 
      - **event:** mounted
      - **firesOn:** the rider (PLAYER) — already player scope, not a new entity hook
      - **data:** { target = <mount entity> }
      - **source:** components/rider.lua:163
      - **useful:** low
    **25.** 
      - **event:** dismounted
      - **firesOn:** the rider (PLAYER) — already player scope
      - **data:** { target = <ex-mount entity> }
      - **source:** components/rider.lua:234
      - **useful:** low
    **26.** 
      - **event:** learncookbookrecipe
      - **firesOn:** the harvester (PLAYER) when harvesting a finished crockpot — note crockpot DONE itself has NO PushEvent (tag 'donecooking' + ondonecooking callback only)
      - **data:** { product = <food prefab>, ingredients = <table of ingredient prefabs> }
      - **source:** components/stewer.lua:293
      - **useful:** low
**5.** 
  - **summary:** This report enumerates EVERY event DSTP already hooks, so the catalog phase can EXCLUDE these and reuse the hook pattern. DSTP uses three registration mechanisms: (1) per-PLAYER `player:ListenForEvent` registered by the events facade via `M.RegisterForPlayer(player,uid,pname)` in each category file; (2) per-WORLD `inst:ListenForEvent` on TheWorld via `M.RegisterWorld(inst)`; (3) NON-PLAYER entity hooks via `AddComponentPostInit` from modmain, which call `HookCombat(self)`/`HookTrader(self)` in events/nonplayer.lua — this is the pattern to copy for any new mob/structure/world-object trigger.

NON-PLAYER HOOK PATTERN (events/nonplayer.lua, the model to reuse): modmain calls `AddComponentPostInit("combat", ...)` / `AddComponentPostInit("trader", ...)`; the hook fn gets `self` (the component), pulls `self.inst`, optionally bails on `inst:HasTag("player")`, then `inst:ListenForEvent("<engine event>", cb)`. Inside the cb it hard-filters (e.g. only emit when target is a player) to keep cost sane, gates on `evt_config.<category>`, and calls `DSTP.PushEvent(...)`. Only TWO components are currently hooked this way: `combat` (newcombattarget -> player_combat_target) and `trader` (trade -> trade_received). A NEW non-player trigger = a new AddComponentPostInit in modmain + a new Hook fn in nonplayer.lua following this exact shape. Centrally-dispatched `entity_death` on the world is ALSO a non-player source: ONE world listener in the facade fans out to each module's `M.OnEntityDeath(world, data)` (players.lua=player_death, boss.lua=boss_killed/boss_event, grief_world.lua=structure_burnt).

Already-covered event STRINGS that the catalog must NOT re-propose (DSTP event string -> engine event/source): players(player_spawn, player_left, player_disconnected, player_new_character, player_migrated, player_ghost, player_respawn, player_resurrected, player_death); combat(player_kill, player_attacked, player_attack_other, player_hit_other, player_block, player_attack_miss, hound_warning, boss_warning[epicscare], player_min_health); nonplayer entity hooks(player_combat_target[newcombattarget], trade_received[trade]); boss/world-death(boss_event[ms_moonboss_was_defeated/ms_lordfruitflykilled], boss_killed[entity_death of NOTABLE mob list]); world(new_day, phase_changed, season_changed, lightning_strike, moon_phase_changed, earthquake, sinkhole_warn, world_save, rift_spawned); weather(storm_changed, precipitation); gathering(player_work[finishedwork], resource_gathered[loot_prefab_spawned], player_harvest, player_startfire, player_pick[picksomething], player_mine_chop_start[working]); griefing per-player(container_opened, container_closed, structure_hammered); grief_world(structure_burnt); survival(player_eat, player_insane, player_sane, player_starving, player_fed, player_freezing, player_warm, player_overheating, player_cooled, player_mounted, player_dismounted, player_on_fire, player_fire_out, player_enlightened, player_lunacy_normal, player_wet); crafting(player_craft, player_build, recipe_unlocked, tech_tree_changed); inventory(player_equip, player_pickup, player_drop, player_unequip, player_item_get, inventory_full); health(health_delta, hunger_delta, sanity_delta); character(recipe_learned, character_transform, player_sleep_start, player_sleep_end); exploration(player_teleported[onwenthome/wormholetravel], player_sunk, fish_caught); chat(chat_message).

KEY GAP for the catalog: DSTP's non-player coverage is THIN. The only true non-player/world-object entity hooks are combat-aggro (newcombattarget), trader gift (trade), and entity_death (mob/structure death). NO triggers exist today for: mob/animal taming/domestication, mob births/spawns, structure built-by-world (only player buildstructure), crop/plant growth, beefalo/critter state, fire IGNITION (only post-mortem structure_burnt — boss.lua explicitly notes a real onignite detector would need an AddComponentPostInit on `burnable`), creature transformations (mob were/phase changes), container/chest looting by mobs, etc. These are the open territory the catalog should explore via the nonplayer.lua AddComponentPostInit pattern. NOTE: several DEAD-listener removals are documented in-code (ms_registerfire, startlongaction, readbook->book_read, onboat->boat_entered, houndwarningsound) — the catalog should avoid re-proposing those exact engine events as they don't fire on the expected entity.

DSTP file paths (all under E:/DSTP/DST_MOD/scripts/dstp/events/): players.lua, combat.lua, nonplayer.lua, boss.lua, world.lua, weather.lua, gathering.lua, griefing.lua, grief_world.lua, survival.lua, crafting.lua, inventory.lua, health.lua, character.lua, exploration.lua; plus chat in E:/DSTP/DST_MOD/scripts/dstp/chat.lua:228.
  - **events:** 
    **1.** 
      - **event:** player_spawn
      - **firesOn:** world (TheWorld) — ms_playerspawn
      - **data:** {userid,name,prefab}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:69 (RegisterWorld)
      - **useful:** high
    **2.** 
      - **event:** player_left
      - **firesOn:** world — ms_playerleft
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:80
      - **useful:** high
    **3.** 
      - **event:** player_disconnected
      - **firesOn:** world — ms_playerdisconnected
      - **data:** {userid,name,reason}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:89
      - **useful:** medium
    **4.** 
      - **event:** player_new_character
      - **firesOn:** world — ms_newplayercharacterspawned
      - **data:** {userid,name,prefab,mode}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:109
      - **useful:** high
    **5.** 
      - **event:** player_migrated
      - **firesOn:** world — ms_playerdespawnandmigrate
      - **data:** {userid,name,to_world,portal}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:125
      - **useful:** medium
    **6.** 
      - **event:** player_ghost
      - **firesOn:** player — ms_becameghost
      - **data:** {userid,name,prefab}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:35 (RegisterForPlayer)
      - **useful:** high
    **7.** 
      - **event:** player_respawn
      - **firesOn:** player — ms_respawnedfromghost
      - **data:** {userid,name,prefab}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:44
      - **useful:** high
    **8.** 
      - **event:** player_resurrected
      - **firesOn:** player — ms_respawnedfromghost
      - **data:** {userid,name,corpse,reviver}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:46
      - **useful:** high
    **9.** 
      - **event:** player_death
      - **firesOn:** world entity_death (filtered HasTag player) — central dispatch
      - **data:** {userid,name,cause}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/players.lua:138 (OnEntityDeath)
      - **useful:** high
    **10.** 
      - **event:** player_kill
      - **firesOn:** player — killed
      - **data:** {userid,name,victim}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:26
      - **useful:** high
    **11.** 
      - **event:** player_attacked
      - **firesOn:** player — attacked
      - **data:** {userid,name,attacker,damage,damage_resolved,weapon,stimuli}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:34
      - **useful:** high
    **12.** 
      - **event:** player_attack_other
      - **firesOn:** player — onattackother
      - **data:** {userid,name,target,target_guid,target_is_player,weapon}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:50
      - **useful:** high
    **13.** 
      - **event:** player_hit_other
      - **firesOn:** player — onhitother
      - **data:** {userid,name,target,target_guid,target_is_player,damage}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:63
      - **useful:** medium
    **14.** 
      - **event:** player_block
      - **firesOn:** player — blocked
      - **data:** {userid,name,attacker,attacker_is_player,damage,original_damage}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:78
      - **useful:** low
    **15.** 
      - **event:** player_attack_miss
      - **firesOn:** player — onmissother
      - **data:** {userid,name,target,target_guid,target_is_player,weapon}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:92
      - **useful:** low
    **16.** 
      - **event:** hound_warning
      - **firesOn:** player — houndwarning
      - **data:** {userid,name,level}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:107
      - **useful:** high
    **17.** 
      - **event:** boss_warning
      - **firesOn:** player — epicscare (debounced 3s)
      - **data:** {userid,name,scarer,duration}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:123
      - **useful:** high
    **18.** 
      - **event:** player_min_health
      - **firesOn:** player — minhealth
      - **data:** {userid,name,cause,afflicter}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/combat.lua:138
      - **useful:** low
    **19.** 
      - **event:** player_combat_target
      - **firesOn:** NON-PLAYER mob (any combat entity) — newcombattarget, AddComponentPostInit hook
      - **data:** {userid,name,aggressor,aggressor_guid,switched_from} (only when target is player)
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/nonplayer.lua:39 (HookCombat)
      - **useful:** high
    **20.** 
      - **event:** trade_received
      - **firesOn:** NON-PLAYER trader entity (pigking/NPC/structure) — trade, AddComponentPostInit hook
      - **data:** {receiver,userid,name,item}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/nonplayer.lua:59 (HookTrader)
      - **useful:** high
    **21.** 
      - **event:** boss_event
      - **firesOn:** world — ms_moonboss_was_defeated / ms_lordfruitflykilled
      - **data:** {event,data}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/boss.lua:28
      - **useful:** medium
    **22.** 
      - **event:** boss_killed
      - **firesOn:** world entity_death (filtered to NOTABLE prefab list) — central dispatch
      - **data:** {prefab,cause}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/boss.lua:55 (OnEntityDeath)
      - **useful:** high
    **23.** 
      - **event:** new_day
      - **firesOn:** world — ms_cyclecomplete
      - **data:** {day}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:26
      - **useful:** high
    **24.** 
      - **event:** phase_changed
      - **firesOn:** world — phasechanged
      - **data:** {phase}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:35
      - **useful:** high
    **25.** 
      - **event:** season_changed
      - **firesOn:** world — seasontick (edge-detected)
      - **data:** {season}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:47
      - **useful:** high
    **26.** 
      - **event:** lightning_strike
      - **firesOn:** world — ms_sendlightningstrike
      - **data:** {x,z}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:53
      - **useful:** medium
    **27.** 
      - **event:** moon_phase_changed
      - **firesOn:** world — moonphasechanged / ms_setmoonphase / phasechanged fallback
      - **data:** {phase,is_new,is_full}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:67
      - **useful:** high
    **28.** 
      - **event:** earthquake
      - **firesOn:** world — startquake
      - **data:** {shard_type,duration}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:98
      - **useful:** medium
    **29.** 
      - **event:** sinkhole_warn
      - **firesOn:** world — ms_sinkhole_warn
      - **data:** {shard_type}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:107
      - **useful:** low
    **30.** 
      - **event:** world_save
      - **firesOn:** world — ms_save
      - **data:** {}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:115
      - **useful:** medium
    **31.** 
      - **event:** rift_spawned
      - **firesOn:** world — ms_riftaddedtopool
      - **data:** {rift_prefab,x,z,shard_type}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/world.lua:130
      - **useful:** high
    **32.** 
      - **event:** storm_changed
      - **firesOn:** world — ms_stormchanged
      - **data:** {stormtype,setting}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/weather.lua:23
      - **useful:** high
    **33.** 
      - **event:** precipitation
      - **firesOn:** world — precipitationchanged
      - **data:** {type,enabled}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/weather.lua:34
      - **useful:** medium
    **34.** 
      - **event:** player_work
      - **firesOn:** player — finishedwork
      - **data:** {userid,name,target,action}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/gathering.lua:31
      - **useful:** medium
    **35.** 
      - **event:** resource_gathered
      - **firesOn:** work TARGET entity — loot_prefab_spawned (nested, one-shot)
      - **data:** {userid,name,source,action,loot,count}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/gathering.lua:53
      - **useful:** medium
    **36.** 
      - **event:** player_harvest
      - **firesOn:** player — harvestsomething
      - **data:** {userid,name,source}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/gathering.lua:78
      - **useful:** medium
    **37.** 
      - **event:** player_startfire
      - **firesOn:** player — onstartedfire
      - **data:** {userid,name,target}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/gathering.lua:92
      - **useful:** high
    **38.** 
      - **event:** player_pick
      - **firesOn:** player — picksomething
      - **data:** {userid,name,source,loot,count}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/gathering.lua:115
      - **useful:** low
    **39.** 
      - **event:** player_mine_chop_start
      - **firesOn:** player — working (edge-detected start)
      - **data:** {userid,name,target}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/gathering.lua:141
      - **useful:** low
    **40.** 
      - **event:** container_opened
      - **firesOn:** player — onopencontainer
      - **data:** {userid,name,container_prefab}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/griefing.lua:26
      - **useful:** medium
    **41.** 
      - **event:** container_closed
      - **firesOn:** player — onclosecontainer
      - **data:** {userid,name,container_prefab}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/griefing.lua:35
      - **useful:** low
    **42.** 
      - **event:** structure_hammered
      - **firesOn:** player — onhammer
      - **data:** {userid,name,prefab}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/griefing.lua:45
      - **useful:** high
    **43.** 
      - **event:** structure_burnt
      - **firesOn:** world entity_death (filtered structure+burnt) — central dispatch
      - **data:** {prefab,cause,x,z}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/grief_world.lua:40 (OnEntityDeath)
      - **useful:** high
    **44.** 
      - **event:** player_eat
      - **firesOn:** player — oneat
      - **data:** {userid,name,food,health,hunger,sanity}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:27
      - **useful:** medium
    **45.** 
      - **event:** player_insane
      - **firesOn:** player — goinsane
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:38
      - **useful:** high
    **46.** 
      - **event:** player_sane
      - **firesOn:** player — gosane
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:43
      - **useful:** medium
    **47.** 
      - **event:** player_starving
      - **firesOn:** player — startstarving
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:48
      - **useful:** high
    **48.** 
      - **event:** player_fed
      - **firesOn:** player — stopstarving
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:53
      - **useful:** medium
    **49.** 
      - **event:** player_freezing
      - **firesOn:** player — startfreezing
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:58
      - **useful:** high
    **50.** 
      - **event:** player_warm
      - **firesOn:** player — stopfreezing
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:63
      - **useful:** medium
    **51.** 
      - **event:** player_overheating
      - **firesOn:** player — startoverheating
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:68
      - **useful:** high
    **52.** 
      - **event:** player_cooled
      - **firesOn:** player — stopoverheating
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:73
      - **useful:** medium
    **53.** 
      - **event:** player_mounted
      - **firesOn:** player — mounted
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:78
      - **useful:** low
    **54.** 
      - **event:** player_dismounted
      - **firesOn:** player — dismounted
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:83
      - **useful:** low
    **55.** 
      - **event:** player_on_fire
      - **firesOn:** player — startfiredamage
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:90
      - **useful:** high
    **56.** 
      - **event:** player_fire_out
      - **firesOn:** player — stopfiredamage
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:95
      - **useful:** medium
    **57.** 
      - **event:** player_enlightened
      - **firesOn:** player — goenlightened
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:102
      - **useful:** medium
    **58.** 
      - **event:** player_lunacy_normal
      - **firesOn:** player — sanitymodechanged (mode==0)
      - **data:** {userid,name,mode}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:113
      - **useful:** low
    **59.** 
      - **event:** player_wet
      - **firesOn:** player — moisturedelta (edge-detected soaked threshold)
      - **data:** {userid,name,moisture,was,wet}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/survival.lua:128
      - **useful:** low
    **60.** 
      - **event:** player_craft
      - **firesOn:** player — builditem
      - **data:** {userid,name,item,recipe}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/crafting.lua:24
      - **useful:** medium
    **61.** 
      - **event:** player_build
      - **firesOn:** player — buildstructure
      - **data:** {userid,name,item,recipe}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/crafting.lua:33
      - **useful:** high
    **62.** 
      - **event:** recipe_unlocked
      - **firesOn:** player — unlockrecipe
      - **data:** {userid,name,recipe}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/crafting.lua:47
      - **useful:** low
    **63.** 
      - **event:** tech_tree_changed
      - **firesOn:** player — techtreechange
      - **data:** {userid,name,science,magic,ancient,celestial,shadow}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/crafting.lua:59
      - **useful:** low
    **64.** 
      - **event:** player_equip
      - **firesOn:** player — equip
      - **data:** {userid,name,item,slot}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/inventory.lua:23
      - **useful:** medium
    **65.** 
      - **event:** player_pickup
      - **firesOn:** player — onpickupitem
      - **data:** {userid,name,item}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/inventory.lua:32
      - **useful:** low
    **66.** 
      - **event:** player_drop
      - **firesOn:** player — dropitem
      - **data:** {userid,name,item}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/inventory.lua:40
      - **useful:** low
    **67.** 
      - **event:** player_unequip
      - **firesOn:** player — unequip
      - **data:** {userid,name,item,slot}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/inventory.lua:48
      - **useful:** low
    **68.** 
      - **event:** player_item_get
      - **firesOn:** player — itemget
      - **data:** {userid,name,prefab,slot}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/inventory.lua:59
      - **useful:** low
    **69.** 
      - **event:** inventory_full
      - **firesOn:** player — inventoryfull
      - **data:** {userid,name,item}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/inventory.lua:71
      - **useful:** low
    **70.** 
      - **event:** health_delta
      - **firesOn:** player — healthdelta
      - **data:** {userid,name,old,new,amount,cause,afflicter}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/health.lua:23
      - **useful:** high
    **71.** 
      - **event:** hunger_delta
      - **firesOn:** player — hungerdelta
      - **data:** {userid,name,old,new,amount}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/health.lua:35
      - **useful:** medium
    **72.** 
      - **event:** sanity_delta
      - **firesOn:** player — sanitydelta
      - **data:** {userid,name,old,new,amount}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/health.lua:45
      - **useful:** medium
    **73.** 
      - **event:** recipe_learned
      - **firesOn:** player — learncookbookrecipe
      - **data:** {userid,name,product}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/character.lua:25
      - **useful:** low
    **74.** 
      - **event:** character_transform
      - **firesOn:** player — transformwere / transformnormal
      - **data:** {userid,name,form}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/character.lua:38 & :47
      - **useful:** medium
    **75.** 
      - **event:** player_sleep_start
      - **firesOn:** player — gotosleep
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/character.lua:56
      - **useful:** low
    **76.** 
      - **event:** player_sleep_end
      - **firesOn:** player — onwakeup
      - **data:** {userid,name}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/character.lua:62
      - **useful:** low
    **77.** 
      - **event:** player_teleported
      - **firesOn:** player — onwenthome / wormholetravel
      - **data:** {userid,name,type}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/exploration.lua:27 & :38
      - **useful:** medium
    **78.** 
      - **event:** player_sunk
      - **firesOn:** player — onsink
      - **data:** {userid,name,x,z}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/exploration.lua:49
      - **useful:** high
    **79.** 
      - **event:** fish_caught
      - **firesOn:** player — fishingcollect
      - **data:** {userid,name,fish}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/events/exploration.lua:58
      - **useful:** low
    **80.** 
      - **event:** chat_message
      - **firesOn:** world chat hook (per-message)
      - **data:** {userid,name,message,...is_command}
      - **source:** E:/DSTP/DST_MOD/scripts/dstp/chat.lua:228
      - **useful:** high

## catalog

- **summary:** DSTP's non-player coverage is thin: today the only true entity/world-object hooks are combat-aggro (newcombattarget -> player_combat_target), trader gift (trade -> trade_received), and the central world entity_death fan-out (boss_killed / structure_burnt / player_death). The open territory is mobs (taming, transforms, freeze, follow/loyalty), structures/workables (BUILT, worked, ignited, container open/loot), and a handful of un-exposed WORLD events (sandstorm/moonstorm start, rift open/close, moon phase, new-day-rollover-as-day-count, nightmare cycle). Most world events are 1-line `world:ListenForEvent` adds (low effort, mirror RegisterWorld in world.lua); the juicy structure/mob ones are AddComponentPostInit + ListenForEvent (medium, copy nonplayer.lua HookCombat/HookTrader). CRITICAL: the most-requested admin triggers that DON'T have a PushEvent — "crockpot finished", "dryer finished", "crop matured", "beebox/planter ready", "repaired", "construction finished" — are signalled via callback fns + TAGs (stewer.ondonecooking, dryer.ondonedrying, crop.onmatured, harvestable.onharvestfn/ongrowfn, repairable.onrepaired), so they require wrapping those Set*Fn callbacks (mechanic-module style, high effort), NOT a ListenForEvent. Likewise "a boss/mob spawned" has NO listenable event (SpawnPrefab pushes nothing) — needs AddPrefabPostInit on the constructor; toadstoolstatechanged is the only real spawnable-state world signal. Ranked below high-usefulness/low-effort first. All run on the master sim; component hooks fire for EVERY entity of that type so they must hard-filter (prefab/HasTag) and gate on evt_config to stay cheap.
- **recommended:** 
  **1.** 
    - **proposedTrigger:** structure_built
    - **dstEvent:** onbuilt
    - **firesOn:** the newly-built structure entity (the product prod)
    - **hookMechanism:** AddComponentPostInit("builder") is WRONG target — onbuilt fires on the product, not the builder. Easiest: AddComponentPostInit on a near-universal structure component? No. Practical path: hook it generically by registering AddComponentPostInit("workable") OR better, since every built structure runs through Builder:DoBuild, wrap via AddComponentPostInit("builder") and inside DoBuild listen on prod. Cleanest is a tiny mechanic-style override of Builder:DoBuild to ListenForEvent('onbuilt', prod). Treat as medium: one AddComponentPostInit("builder") that, on each build, attaches a one-shot 'onbuilt' listener to the product.
    - **category:** crafting
    - **data:** { builder = <player inst>, pos = <Vector3 placement point> } -> emit { userid, name, prefab=prod.prefab, x, z }
    - **useful:** high
    - **effort:** medium
  **2.** 
    - **proposedTrigger:** sandstorm_changed
    - **dstEvent:** ms_stormchanged
    - **firesOn:** TheWorld (sandstorms pushes on its world-component owner = TheWorld; moonstorms pushes on TheWorld). NOTE: DSTP ALREADY has storm_changed in weather.lua consuming ms_stormchanged — VERIFY before adding; if storm_changed already covers both sandstorm+moonstorm via {stormtype,setting}, this is ALREADY-COVERED and should be DROPPED.
    - **hookMechanism:** world ListenForEvent (already wired as storm_changed)
    - **category:** weather
    - **data:** { stormtype = 1(SANDSTORM)|2(MOONSTORM), setting = bool (true=started, false=ended) }
    - **useful:** high
    - **effort:** low
  **3.** 
    - **proposedTrigger:** rift_closed
    - **dstEvent:** ms_riftremovedfrompool
    - **firesOn:** TheWorld
    - **hookMechanism:** world ListenForEvent (mirror the existing rift_spawned = ms_riftaddedtopool in world.lua:130 — this is its closing counterpart, NOT yet covered)
    - **category:** world
    - **data:** { rift = <rift entity> } -> emit { rift_prefab, x, z, shard_type }
    - **useful:** high
    - **effort:** low
  **4.** 
    - **proposedTrigger:** moon_phase_full
    - **dstEvent:** moonphasechanged2
    - **firesOn:** TheWorld (via clock _world)
    - **hookMechanism:** world ListenForEvent. NOTE: DSTP already has moon_phase_changed (moonphasechanged/ms_setmoonphase). moonphasechanged2 ADDS the waxing flag + structured {moonphase,waxing}; only add if the existing one lacks waxing/new-vs-full richness, else fold the {waxing} field into the existing trigger rather than a new node.
    - **category:** world
    - **data:** { moonphase = "new"|"quarter"|"half"|"threequarter"|"full", waxing = bool }
    - **useful:** high
    - **effort:** low
  **5.** 
    - **proposedTrigger:** nightmare_phase
    - **dstEvent:** nightmarephasechanged
    - **firesOn:** TheWorld (via nightmareclock _world) — CAVES/RUINS shard only
    - **hookMechanism:** world ListenForEvent (1-line add in world.lua, only meaningful on the caves shard)
    - **category:** world
    - **data:** PHASE_NAMES string: "calm"|"warn"|"wild"|"dawn" -> emit { phase, shard_type }
    - **useful:** high
    - **effort:** low
  **6.** 
    - **proposedTrigger:** structure_worked
    - **dstEvent:** workfinished
    - **firesOn:** the structure/resource being worked (wall hammered down, tree felled, boulder mined out, chest destroyed)
    - **hookMechanism:** AddComponentPostInit("workable") -> on self.inst ListenForEvent('workfinished'). Copy nonplayer.lua HookCombat shape. Hard-filter to structures/notable prefabs (NOT grass/twigs) to avoid spam; gate on evt_config.griefing.
    - **category:** griefing
    - **data:** { worker = <doer inst> } -> emit { prefab, userid, name (of worker if player), x, z }
    - **useful:** high
    - **effort:** medium
  **7.** 
    - **proposedTrigger:** object_ignited
    - **dstEvent:** onignite
    - **firesOn:** the object that just caught fire (structure/resource/mob)
    - **hookMechanism:** AddComponentPostInit("burnable") -> ListenForEvent('onignite'). This is the IGNITION detector boss.lua explicitly notes is missing (structure_burnt only sees post-mortem). Catches the arsonist via data.doer. Gate on evt_config.griefing; filter to structures/notable prefabs.
    - **category:** griefing
    - **data:** { source = <fire source inst>, doer = <igniter inst, may be nil> } -> emit { prefab, doer_userid, doer_name, x, z }
    - **useful:** high
    - **effort:** medium
  **8.** 
    - **proposedTrigger:** container_opened_entity
    - **dstEvent:** onopen
    - **firesOn:** the container entity (chest, icebox, backpack, etc.) — knows WHICH chest, unlike the existing player-side container_opened
    - **hookMechanism:** AddComponentPostInit("container") -> ListenForEvent('onopen'). Note DSTP already has container_opened on the PLAYER (onopencontainer); this entity-side variant identifies the specific chest for anti-grief. Filter to placed/world containers (skip player inventory/backpack on-body); gate evt_config.griefing.
    - **category:** griefing
    - **data:** { doer = <player inst opening it> } -> emit { container_prefab, container_guid, userid, name, x, z }
    - **useful:** high
    - **effort:** medium
  **9.** 
    - **proposedTrigger:** container_item_taken
    - **dstEvent:** itemlose
    - **firesOn:** the container entity when an item is removed/withdrawn (chest looted)
    - **hookMechanism:** AddComponentPostInit("container") -> ListenForEvent('itemlose'). HIGH for chest-audit / anti-loot flows. Medium-noise (fires per item moved) so MUST gate on evt_config.griefing and ideally debounce/filter to world chests.
    - **category:** griefing
    - **data:** { slot = <int>, prev_item = <item inst> } -> emit { container_prefab, container_guid, item=prev_item.prefab, slot }
    - **useful:** high
    - **effort:** medium
  **10.** 
    - **proposedTrigger:** container_item_added
    - **dstEvent:** itemget
    - **firesOn:** the container entity when an item is deposited
    - **hookMechanism:** AddComponentPostInit("container") -> ListenForEvent('itemget'). Pairs with itemlose for full chest auditing. Same noise/gating caveats.
    - **category:** griefing
    - **data:** { slot = <int>, item = <item inst>, src_pos = <Vector3 optional> } -> emit { container_prefab, container_guid, item=item.prefab, slot }
    - **useful:** medium
    - **effort:** medium
  **11.** 
    - **proposedTrigger:** beefalo_tamed
    - **dstEvent:** domesticated
    - **firesOn:** the creature being tamed (beefalo)
    - **hookMechanism:** AddComponentPostInit("domesticatable") -> ListenForEvent('domesticated'). The classic 'a mob was tamed' trigger. Cheap — domesticatable is rare (basically beefalo). Gate on a new evt_config.creatures category.
    - **category:** new: creatures
    - **data:** { tendencies = <table: ornery/pudgy/docile weights> } -> emit { prefab, guid, tendency=<dominant>, x, z }
    - **useful:** high
    - **effort:** medium
  **12.** 
    - **proposedTrigger:** beefalo_feral
    - **dstEvent:** goneferal
    - **firesOn:** the beefalo reverting to wild (starvation / lost domestication)
    - **hookMechanism:** AddComponentPostInit("domesticatable") -> ListenForEvent('goneferal'). Same hook fn as beefalo_tamed (register both listeners in one HookDomesticatable).
    - **category:** new: creatures
    - **data:** { domesticated = bool (was it tamed before) } -> emit { prefab, guid, was_domesticated, x, z }
    - **useful:** medium
    - **effort:** medium
  **13.** 
    - **proposedTrigger:** mob_transform
    - **dstEvent:** transformwere / transformnormal
    - **firesOn:** the were-creature (werepig, weremoose, etc.) when it changes form. NOTE: DSTP already has character_transform for the PLAYER (Woodie) via these same events — this is the NON-PLAYER mob variant (filter OUT HasTag('player')).
    - **hookMechanism:** AddComponentPostInit("werebeast") -> ListenForEvent('transformwere'/'transformnormal'), bail if inst:HasTag('player'). Cheap (werebeast is rare).
    - **category:** new: creatures
    - **data:** no payload -> emit { prefab, guid, form="were"|"normal", x, z }
    - **useful:** medium
    - **effort:** medium
  **14.** 
    - **proposedTrigger:** mob_frozen
    - **dstEvent:** freeze
    - **firesOn:** any mob/entity with freezable that froze solid
    - **hookMechanism:** AddComponentPostInit("freezable") -> ListenForEvent('freeze'). freezable is common (most mobs) so MUST filter to combat mobs / gate on evt_config.creatures, otherwise noisy.
    - **category:** new: creatures
    - **data:** no payload -> emit { prefab, guid, x, z }
    - **useful:** medium
    - **effort:** medium
  **15.** 
    - **proposedTrigger:** resource_picked
    - **dstEvent:** picked
    - **firesOn:** the plant/bush/grass/berrybush/flower that was picked (the resource node, not the picker)
    - **hookMechanism:** AddComponentPostInit("pickable") -> ListenForEvent('picked'). pickable is VERY common -> high frequency; filter to notable prefabs and gate on evt_config.gathering. DSTP has player-side player_pick (picksomething); this is the node-side variant carrying loot+location.
    - **category:** gathering
    - **data:** { picker = <player>, loot = <table of loot prefabs>, plant = <self> } -> emit { prefab, userid, name, loot, count, x, z }
    - **useful:** medium
    - **effort:** medium
  **16.** 
    - **proposedTrigger:** item_planted
    - **dstEvent:** itemplanted
    - **firesOn:** TheWorld (global) when a deployable is placed (saplings, structures, traps, walls deployed)
    - **hookMechanism:** world ListenForEvent — LOW effort, no per-entity postinit needed (it's world-scoped). Good cheap 'something was deployed/planted' signal.
    - **category:** world
    - **data:** { doer = <deployer inst>, pos = <Vector3> } -> emit { userid, name, x, z }
    - **useful:** medium
    - **effort:** low
  **17.** 
    - **proposedTrigger:** machine_toggled
    - **dstEvent:** machineturnedon / machineturnedoff
    - **firesOn:** the machine structure (flingomatic, lightning rod conductor, gear devices) when toggled
    - **hookMechanism:** AddComponentPostInit("machine") -> ListenForEvent both. Cheap (machine is uncommon). gate evt_config.world or griefing.
    - **category:** world
    - **data:** no payload -> emit { prefab, guid, state="on"|"off", x, z }
    - **useful:** medium
    - **effort:** medium
  **18.** 
    - **proposedTrigger:** object_activated
    - **dstEvent:** onactivated
    - **firesOn:** the activatable world object (ancient pseudoscience station, terrarium, hand-activated things)
    - **hookMechanism:** AddComponentPostInit("activatable") -> ListenForEvent('onactivated'). Cheap, uncommon component.
    - **category:** world
    - **data:** { doer = <player inst> } -> emit { prefab, guid, userid, name, x, z }
    - **useful:** medium
    - **effort:** medium
  **19.** 
    - **proposedTrigger:** item_perished
    - **dstEvent:** perished
    - **firesOn:** the item that fully spoiled (food/perishable) — fires on the ITEM
    - **hookMechanism:** AddComponentPostInit("perishable") -> ListenForEvent('perished'). perishable is common; filter and gate. Mostly niche for economy/farm flows.
    - **category:** world
    - **data:** no payload -> emit { prefab, guid, x, z }
    - **useful:** low
    - **effort:** medium
  **20.** 
    - **proposedTrigger:** mount_rider_changed
    - **dstEvent:** riderchanged
    - **firesOn:** the mount/beefalo/woby when mounted or dismounted (the non-player half of mounting)
    - **hookMechanism:** AddComponentPostInit("rideable") -> ListenForEvent('riderchanged'). DSTP has player_mounted/dismounted on the rider; this is the mount-side view. Cheap (rideable rare).
    - **category:** new: creatures
    - **data:** { oldrider = <entity|nil>, newrider = <entity|nil> } -> emit { prefab, guid, rider_userid, rider_name, mounted=bool }
    - **useful:** low
    - **effort:** medium
  **21.** 
    - **proposedTrigger:** trap_sprung
    - **dstEvent:** springtrap / trapped
    - **firesOn:** springtrap fires on the TRAP; trapped fires on the caught creature (mob victim)
    - **hookMechanism:** AddComponentPostInit("trap") -> ListenForEvent('springtrap'). Filter out the {loading=true} arming case. Niche.
    - **category:** griefing
    - **data:** springtrap: {} (or {loading=true} on arm); trapped: { trap = <trap inst> } -> emit { trap_prefab, guid, x, z }
    - **useful:** low
    - **effort:** medium
  **22.** 
    - **proposedTrigger:** toadstool_state_changed
    - **dstEvent:** toadstoolstatechanged
    - **firesOn:** TheWorld — Toadstool (mushroom boss) spawner state machine changed (became spawnable/active). One of the FEW real boss-availability world signals.
    - **hookMechanism:** world ListenForEvent — LOW effort. The closest thing to a 'boss is now spawnable' event (most giants have NO spawn event).
    - **category:** bosses
    - **data:** { spawner = <spawner>, state = <state> } -> emit { state }
    - **useful:** medium
    - **effort:** low
  **23.** 
    - **proposedTrigger:** crockpot_finished
    - **dstEvent:** (NONE — no PushEvent; uses ondonecooking callback + 'donecooking' tag)
    - **firesOn:** the crockpot/stewer when cooking completes
    - **hookMechanism:** needs a mechanic module: AddComponentPostInit("stewer") then WRAP self.ondonecooking (or watch the 'donecooking' tag via inst:ListenForEvent('ms_...') — there is none, so wrap the SetCookFinishedFn/ondonecooking). HIGH effort, callback-wrap pattern (like land_claims). Commonly-requested admin trigger but NOT a simple ListenForEvent.
    - **category:** new: production
    - **data:** synthesize: { prefab="cookpot", guid, product=<food prefab>, x, z }
    - **useful:** high
    - **effort:** high
  **24.** 
    - **proposedTrigger:** dryingrack_finished
    - **dstEvent:** (NONE — no PushEvent; uses ondonedrying callback + 'dried' tag)
    - **firesOn:** the drying rack when an item finishes drying (jerky, etc.)
    - **hookMechanism:** needs a mechanic module: AddComponentPostInit("dryer") and WRAP self.ondonedrying. HIGH effort, same callback-wrap caveat as crockpot.
    - **category:** new: production
    - **data:** synthesize: { prefab, guid, product=<dried prefab>, x, z }
    - **useful:** medium
    - **effort:** high
  **25.** 
    - **proposedTrigger:** crop_matured
    - **dstEvent:** (NONE — no PushEvent; crop.onmatured callback)
    - **firesOn:** the farm crop/plant when it finishes growing
    - **hookMechanism:** needs a mechanic module: wrap crop.onmatured (and/or harvestable.ongrowfn for beebox/mushroom planter ready). HIGH effort callback-wrap.
    - **category:** new: production
    - **data:** synthesize: { prefab, guid, product=<crop prefab>, x, z }
    - **useful:** medium
    - **effort:** high
  **26.** 
    - **proposedTrigger:** creature_spawned
    - **dstEvent:** (NONE — SpawnPrefab pushes no event)
    - **firesOn:** n/a — a newly created mob has no birth/spawn PushEvent in vanilla
    - **hookMechanism:** needs AddPrefabPostInit(<prefab>, ...) per-prefab constructor hook (NOT a ListenForEvent). HIGH effort and must enumerate target prefabs. This is the only way to do 'a beefalo/boss spawned'; childspawner only pushes childgoinghome (return), not birth.
    - **category:** new: creatures
    - **data:** synthesize at constructor: { prefab, guid, x, z } (position may be (0,0,0) until placed — listen one frame later)
    - **useful:** high
    - **effort:** high
- **alreadyCovered:** 
  - player_combat_target (newcombattarget, nonplayer.lua HookCombat) — mob aggro on a player
  - trade_received (trade, nonplayer.lua HookTrader) — trader/NPC fed a gift
  - boss_killed (entity_death of NOTABLE prefab list, boss.lua central dispatch)
  - structure_burnt (entity_death filtered structure+burnt, grief_world.lua)
  - player_death (entity_death filtered HasTag player, players.lua)
  - boss_event (ms_moonboss_was_defeated / ms_lordfruitflykilled, boss.lua)
  - rift_spawned (ms_riftaddedtopool, world.lua) — note: rift_closed/ms_riftremovedfrompool is its NOT-covered counterpart and IS recommended
  - storm_changed (ms_stormchanged, weather.lua) — already covers sandstorm+moonstorm; sandstorm_changed recommendation flagged to DROP if so
  - precipitation (precipitationchanged, weather.lua)
  - new_day (ms_cyclecomplete, world.lua), phase_changed (phasechanged), season_changed (seasontick edge), lightning_strike (ms_sendlightningstrike), moon_phase_changed (moonphasechanged), earthquake (startquake), sinkhole_warn, world_save (ms_save)
  - hound_warning (houndwarning on player, combat.lua), boss_warning (epicscare, combat.lua)
  - resource_gathered (loot_prefab_spawned on work target, gathering.lua), player_work (finishedwork), player_harvest (harvestsomething), player_pick (picksomething), player_mine_chop_start (working)
  - container_opened/container_closed (onopencontainer/onclosecontainer on the PLAYER, griefing.lua) — distinct from the recommended entity-side onopen/onclose on the chest
  - structure_hammered (onhammer on player, griefing.lua)
  - character_transform (transformwere/transformnormal on the PLAYER, character.lua) — distinct from recommended mob_transform (non-player)
  - player_mounted/player_dismounted (mounted/dismounted on player, survival.lua) — distinct from recommended mount-side riderchanged
- **notes:** 
  - ALL these hooks run server-side on the master sim. Component hooks via AddComponentPostInit fire the postinit for EVERY entity that ever gains that component — common components (burnable, freezable, pickable, perishable, workable, container) cover thousands of entities, so the hook fn MUST hard-filter by prefab / HasTag and the inner callback MUST gate on evt_config.<category> (early-return when the category is off) to stay cheap. Rare components (domesticatable, werebeast, machine, activatable, rideable, trader) are basically free.
  - The cleanest cost model mirrors nonplayer.lua: in the postinit, attach the ListenForEvent only if a cheap predicate passes (e.g. inst:HasTag('structure') for workable/burnable, NOT inst:HasTag('player')); inside the cb, second-stage filter + evt_config gate + DSTP.PushEvent.
  - MECHANIC-MODULE (high-effort) class — crockpot_finished, dryingrack_finished, crop_matured, and the related repaired/construction-finished/harvestable-ready: these DO NOT PushEvent. They run callback fns (stewer.ondonecooking, dryer.ondonedrying, crop.onmatured, harvestable.onharvestfn/ongrowfn, repairable.onrepaired, constructionsite.onconstructedfn) and/or toggle TAGs (donecooking/dried/readytocook). Exposing them needs an AddComponentPostInit that WRAPS the existing Set*Fn (call the original, then DSTP.PushEvent) — the land_claims.lua mechanic-module pattern. Do not promise these as 1-line ListenForEvent triggers.
  - 'A boss/mob spawned' has NO listenable event: deerclops/bearger/malbatross/klaus/crabking/daywalker spawners call SpawnPrefab directly with no PushEvent, and there is no generic per-creature birth event (childspawner pushes childgoinghome = child RETURNING home, not born). The only ways: AddPrefabPostInit on the constructor (per-prefab, high effort), or for state-machine bosses the world signal toadstoolstatechanged (Toadstool only). entity_death already gives the DEATH side for free (filter by prefab).
  - 'Any creature died' should NOT be a new per-mob hook — reuse the existing central entity_death dispatch (boss.lua OnEntityDeath) and filter by data.inst.prefab. Adding a per-mob 'death' listener would duplicate work the world listener already does.
  - Several events are per-tick / per-hit noise and were intentionally excluded from recommendations: attacked/onattackother/doattack (combat per-hit), healthdelta on mobs, perishchange, weathertick, clocktick/seasontick(progress), domesticationdelta/obediencedelta, beingridden, acidleveldelta, loot_prefab_spawned/on_loot_dropped (per-loot-item). If ever exposed they need heavy debounce.
  - Client-vs-server: onhitother / onattackother / newcombattarget and most combat/work internals fire ONLY on the server (master sim) — fine for these backend hooks, but a reminder that none of this is visible client-side. houndwarning fires per-targeted-PLAYER (not TheWorld) — DSTP already consumes it as the player-scope hound_warning.
  - DEAD-listener warning from the already-covered sweep: do NOT propose ms_registerfire, startlongaction, readbook->book_read, onboat->boat_entered, houndwarningsound — these don't fire on the expected entity in current DST and were removed in-code.
  - Where a recommendation overlaps an existing player-side trigger (container open/close, mob_transform vs character_transform, mount riderchanged vs player_mounted), the value is that the ENTITY-side variant identifies WHICH object/mob (guid+prefab+position) for anti-grief/auditing — keep them as separate nodes, don't merge into the player events.
