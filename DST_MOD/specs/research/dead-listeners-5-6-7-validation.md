# Dead/leaked listeners (#5/#6/#7) validation

> Saved from workflow `Validate the suspected dead/leaked listeners (#5/#6/#7) against the extracted vanilla DST scripts`. Raw multi-agent research output;
> see the sibling specs for the distilled conclusions.

## suspects

**1.** 
  - **event:** ms_earthquake
  - **existsInVanilla:** false
  - **firesOn:** none
  - **listenedString:** ms_earthquake
  - **verdict:** remap
  - **pushSite:** /tmp/dstscripts/scripts/components/quaker.lua:510
  - **remapTo:** startquake (entity: TheWorld / world inst, master sim). Data payload: { duration, debrisperiod }. Warning-phase alternative is "warnquake" (quaker.lua:522).
  - **notes:** DEAD listener. `ms_earthquake` is never PushEvent'd anywhere in vanilla DST scripts (grep returns zero hits). The mod listens for it on the world `inst` (DST_MOD/scripts/dstp/events/world.lua:93) so it can never fire — effectively dead. The real earthquake events come from the `quaker` component (a WORLD component, added in prefabs/cave_network.lua), which PushEvents on its owner inst (= TheWorld, master sim): `startquake` with {duration, debrisperiod} at quaker.lua:510 when the quake begins, and `warnquake` at quaker.lua:522 for the pre-quake warning. Vanilla prefabs confirm the entity: molebat/spiderhole/support_pillar/ropebridgemanager all ListenForEvent("startquake"/"warnquake", ..., TheWorld.net) — world-scoped. REMAP `ms_earthquake` -> `startquake` (keep listening on `inst`, the server world, since the mod runs master-sim). Also: the adjacent `ms_sinkhole_warn` listener (world.lua:101) should be audited the same way — verify it exists.
**2.** 
  - **event:** hound_warning
  - **existsInVanilla:** false
  - **firesOn:** player
  - **listenedString:** houndwarningsound
  - **pushSite:** components/hounded.lua:862
  - **verdict:** remap
  - **remapTo:** "houndwarning" on each player entity (data = HOUNDWARNINGTYPE level int)
  - **notes:** DEAD on two counts. (1) Wrong string: "houndwarningsound" is NOT a PushEvent anywhere in vanilla DST — it does not exist. The hounded component's method is named DoWarningSound(), but the event it pushes is "houndwarning" (hounded.lua:862 and the delayed variant at :884). (2) Wrong entity: the listener is attached to the world inst (TheWorld), but hounded.lua pushes "houndwarning" on each individual PLAYER entity (player:PushEvent("houndwarning", ...)), not on TheWorld. So this listener never fires — it is effectively dead.

CORRECT REMAP: listen for "houndwarning" on each player. Site: components/hounded.lua:862 (self:DoWarningSound, the main path) and :884 (self:DoDelayedWarningSound, for delayed-spawn players). The event arg is an int from HOUNDWARNINGTYPE (constants.lua:2441) indicating warning level/type (LVL1..LVL4, *_WORM variants, WORM_BOSS).

IMPLEMENTATION NOTE: since it fires per-player, the world.lua listener pattern won't work directly — you need to register it per-player (e.g. on player_spawn add inst:ListenForEvent("houndwarning", ...) to the player, like the existing per-player event registrations), or hook it where players are tracked. The data payload can carry the userid + warning level. The category mapping ("bosses") is reasonable but this is more accurately a hound-attack warning; keep under bosses/world as the mod prefers. The sibling listener "ms_houndattack" at world.lua:124 DOES fire on TheWorld (hounded pushes it world-wide) so that one is fine — only houndwarningsound is broken.
**3.** 
  - **event:** ms_houndattack
  - **existsInVanilla:** false
  - **firesOn:** none
  - **listenedString:** ms_houndattack
  - **verdict:** remap
  - **pushSite:** 
  - **remapTo:** "houndwarning" pushed on the PLAYER entity (not TheWorld) — components/hounded.lua:862 and :884: player:PushEvent("houndwarning", HOUNDWARNINGTYPE[v.sound])
  - **notes:** Dead listener. `ms_houndattack` does NOT exist as a PushEvent anywhere in vanilla DST (grep of /tmp/dstscripts/scripts returns zero PushEvent sites; the only textual hit is an unrelated UI texture name "houndattacks.tex" in map/customize.lua:595). DSTP listens for it on TheWorld inst (DST_MOD/scripts/dstp/events/world.lua:124), so it can never fire — effectively dead.

Vanilla hound mechanics: the hounded component (a TheWorld component) has NO world event for the actual attack/spawn. When a wave begins, hounds are spawned silently via SummonSpawn/ReleaseSpawn (hounded.lua:410/437) with no PushEvent. The only player-facing signal is the approach warning: player:PushEvent("houndwarning", HOUNDWARNINGTYPE[v.sound]) at hounded.lua:862 and :884 — fired on each targeted PLAYER, not on TheWorld. This is also replicated to the client via player_classified (player_classified.lua:1175).

Recommendation: the DSTP `hound_attack` event has no faithful world-level source. Options: (1) REMAP to "houndwarning" but it must be listened on the PLAYER inst, not TheWorld, and it semantically means "warning/approach" not "attack begins" — overlaps with the existing hound_warning listener. (2) Better: REMOVE the ms_houndattack listener as dead, since there is no distinct "hounds spawned" world event to bind to and houndwarning already powers hound_warning. If a true attack signal is needed, it would require a mechanic-module hook (override SummonSpawn) rather than a vanilla event. Note: the sibling listener on line 116 ("houndwarningsound") is ALSO suspect — vanilla pushes "houndwarning" (on player), not "houndwarningsound" (on world); that's a separate dead listener worth flagging.
**4.** 
  - **event:** ms_registerfire
  - **existsInVanilla:** false
  - **firesOn:** none
  - **listenedString:** ms_registerfire
  - **pushSite:** 
  - **verdict:** remove
  - **remapTo:** No 1:1 world remap exists. There is NO world-level fire-started event in vanilla. The real fire ignition event is the entity-level `onignite` pushed on the burning entity itself: components/burnable.lua:375 `self.inst:PushEvent("onignite", { source = source, doer = doer })`. To detect fires for griefing, you must hook every burnable via AddComponentPostInit("burnable") and ListenForEvent("onignite", ...) on each entity — it canNOT be a single TheWorld listener.
  - **notes:** `ms_registerfire` does not exist anywhere in vanilla DST scripts (grep of /tmp/dstscripts/scripts returns nothing) and is flagged as fabricated in the mod's own audit (DST_MOD/specs/mod-audit-2026-06.md:55). The current listener is at DST_MOD/scripts/dstp/events/boss.lua:54, attached to the world inst (`inst:ListenForEvent("ms_registerfire", ...)`). The `ms_register*` naming family IS real (ms_registerspawnpoint, ms_registercorpse, ms_registerlinkeditem, etc. all PushEvent on TheWorld), so the name was plausibly invented by analogy — but no `ms_registerfire` is ever pushed, so this listener NEVER fires. It is a dead listener: REMOVE it. The handler's `fire_started` PushEvent / boss-category gating is therefore unreachable. If fire-started detection is genuinely wanted, it cannot be a world listener; it must be a per-burnable `onignite` hook (burnable.lua:375), which is a different mechanism (AddComponentPostInit, in-frame), not a remap of an existing world event. Recommend REMOVE here and, if needed, implement fire detection separately as a burnable mechanic module.
**5.** 
  - **event:** player_action_start
  - **existsInVanilla:** true
  - **firesOn:** other
  - **listenedString:** startlongaction
  - **verdict:** remove
  - **pushSite:** /tmp/dstscripts/scripts/stategraphs/SGwilson.lua:8238
  - **remapTo:** 
  - **notes:** DEAD LISTENER (wrong entity). `startlongaction` DOES exist as a PushEvent in vanilla, but it is ALWAYS pushed on the action's TARGET entity (`inst.bufferedaction.target`), never on the player. The player (doer) is passed as the event's `data`/second arg. Confirmed at every push site: SGwilson.lua:8238 and :12771, SGplayer_hosted.lua:229, SGshadowwaxwell.lua:1003, SGhermitcrab.lua:2301/2354, SGwx78_possessedbody.lua:2023/3055, SGwx78_possessedbody_no_package.lua:930, SGdaywalker2.lua:863 — all use `target:PushEvent("startlongaction", inst)`. The listeners that consume it in vanilla sit on the targets themselves (prefabs/gelblob.lua:885, prefabs/tumbleweed.lua:480, prefabs/junk_pile.lua:316, prefabs/junk_pile_big.lua:592). Because DSTP does `player:ListenForEvent("startlongaction", ...)` (gathering.lua:70), the player never receives it → it can never fire. There is no faithful player-side single-event remap for 'began a long action' (no player-pushed equivalent). REMOVE: the `player_action_start` event it feeds is dead, and gathering completion is already covered by player_harvest / player_work. (Remapping to the target would require listening on every actionable world entity — out of scope and not a player event.)
**6.** 
  - **event:** onleftplayer
  - **existsInVanilla:** false
  - **firesOn:** none
  - **listenedString:** onleftplayer
  - **verdict:** remap
  - **pushSite:** scripts/prefabs/wormhole.lua:76
  - **remapTo:** "wormholetravel" pushed on the player (doer) — player:ListenForEvent("wormholetravel", fn). Use this for the wormhole_exit/travel case.
  - **notes:** "onleftplayer" does NOT exist as a PushEvent anywhere in vanilla DST (grep of /tmp/dstscripts/scripts finds zero PushEvent for it) — the listener in DST_MOD/scripts/dstp/events/exploration.lua:34 is fully DEAD and never fires. The paired "onwenthome" listener (line 25) is also mostly wrong: "onwenthome" DOES exist but is normally pushed on the HOME/target entity (e.g. actions.lua:2919 act.target:PushEvent("onwenthome",{doer=...}); walrus.lua:65 home:PushEvent; berrybush/beefalo/catcoon listen on themselves) — it fires on the player (doer) only when an entity sets force_onwenthome_message (catcoon/mole/rabbitking — NOT players), so listening for it on a player is effectively dead too. The REAL player wormhole/teleport event is "wormholetravel", which is pushed directly on the doer (the traveling player) at prefabs/wormhole.lua:76 (doer:PushEvent("wormholetravel", WORMHOLETYPE.WORM)). player_classified.lua:1172 confirms it propagates from the player. There is no separate enter/exit pair — a single wormholetravel fires on travel. Recommendation: REMAP both listeners (onwenthome + onleftplayer) to a single player:ListenForEvent("wormholetravel", ...) firing one player_teleported event (drop the enter/exit distinction, or use type="wormhole"). Optionally also listen for "doneteleporting" but note that one fires on the TELEPORTER prefab (teleporter.lua:238 self.inst:PushEvent), not the player, so it is NOT usable as a per-player listener.
**7.** 
  - **event:** onboat
  - **existsInVanilla:** false
  - **firesOn:** none
  - **listenedString:** onboat
  - **verdict:** remove
  - **pushSite:** 
  - **remapTo:** No usable server-side remap. The semantically-equivalent vanilla event is got_on_platform (PushEvent at /tmp/dstscripts/scripts/components/walkableplatformplayer.lua:211, pushed on the player), but it is gated by `if not TheNet:IsDedicated() and self.inst == ThePlayer` so it only fires CLIENT-SIDE on the local player and never on the server where DSTP listens. The only server-side boarding signal is the master-sim call walkableplatform:AddPlayerOnPlatform (walkableplatformplayer.lua:202), which is a component method, not a player PushEvent — it cannot be reached with player:ListenForEvent. A server-side boat-board detector would require hooking the walkableplatform component, not a listener. Recommend REMOVE.
  - **notes:** Grep across /tmp/dstscripts/scripts found ZERO `PushEvent("onboat"...)` / `PushEvent("onboatoff"...)` in vanilla DST — these strings simply do not exist as events. The DSTP listener is at DST_MOD/scripts/dstp/events/exploration.lua:62 (onboat → boat_entered) and :67 (onboatoff → boat_exited), attached to the player. Since DSTP runs server-side and these events never fire on any entity server-side, both listeners are dead and emit boat_entered/boat_exited never. The real boarding push is got_on_platform / got_off_platform (walkableplatformplayer.lua:211/229) but client-local-player only; component is added in player_common.lua:2528. Matches the prior audit note (mod-audit-2026-06.md:57-58). REMOVE both onboat and onboatoff listeners (and the boat_entered/boat_exited events they back) unless a Lua mechanic module hooks walkableplatform on the server.
**8.** 
  - **event:** onboatoff
  - **existsInVanilla:** false
  - **firesOn:** none
  - **listenedString:** onboatoff
  - **pushSite:** 
  - **verdict:** remove
  - **remapTo:** No viable server-side remap. The closest vanilla event is "got_off_platform" (and its pair "got_on_platform"), pushed on the PLAYER at components/walkableplatformplayer.lua:229 (GetOffPlatform) — but it is gated by `if not TheNet:IsDedicated() and self.inst == ThePlayer`, i.e. CLIENT-ONLY. It does NOT fire on the master/dedicated sim where the DSTP mod listens, so it is effectively dead server-side too. (The companion "onboat" listener at exploration.lua:62 is the same story — there is no vanilla "onboat" PushEvent on the player either; only client-side `got_on_platform`.) If a server-side boat signal is ever needed, hook the boat/walkableplatform's onsink (walkableplatform.lua:35-40) or the embarker's done_embark_movement (embarker.lua:21/26), not a player event.
  - **notes:** "onboatoff" does not exist as a PushEvent anywhere in vanilla DST (grep of /tmp/dstscripts/scripts returns zero hits). The listener at DST_MOD/scripts/dstp/events/exploration.lua:67 is therefore dead — its PushEvent("boat_exited") will never fire. The vanilla boat-leaving event is "got_off_platform" pushed on the player (walkableplatformplayer.lua:229), but it is wrapped in `not TheNet:IsDedicated() and self.inst == ThePlayer`, making it client/local-only and NOT available to the server-side mod. So there is no correct same-side remap: REMOVE the listener (and likewise reconsider the sibling "onboat"→boat_entered listener at line 62, which is dead for the same reason). Confirmed in mod-audit-2026-06.md:58 which already flagged onboatoff (line ref 1785) as non-firing on the player.
**9.** 
  - **event:** book_read
  - **existsInVanilla:** false
  - **firesOn:** none
  - **listenedString:** readbook
  - **pushSite:** 
  - **verdict:** remove
  - **remapTo:** 
  - **notes:** The listener at E:\DSTP\DST_MOD\scripts\dstp\events\character.lua:32 does player:ListenForEvent("readbook", ...) -> DSTP.PushEvent("book_read"). The string "readbook" is NEVER pushed as an event anywhere in vanilla DST (grep for PushEvent("readbook"/"peruse"/"onread") returns nothing). Book reading in vanilla is implemented via CALLBACK FUNCTIONS, not events: components/reader.lua:43 (self.onread, set by SetOnReadFn, invoked at reader.lua:53-54 after book.OnRead), components/book.lua:10/62 (self.onread Interact), components/simplebook.lua:19-20 (onreadfn). The book stategraph states "book"/"book2" (SGwilson.lua:9888-10060) push no event on the player either. So this is a DEAD listener (already flagged in DST_MOD/specs/mod-audit-2026-06.md:58). No general book-read PushEvent exists to remap to. The only book-adjacent player events are "learncookbookrecipe" (cookbook.lua:293, fires on harvester/player when learning a Cook Pot recipe from the cookbook) and "learncookbookstats" (player on inventory pickup) — both are cookbook/cooking semantics, NOT Wickerbottom reading a book, so they do not satisfy the intent of "book_read". Verdict: REMOVE the listener. If a future need arises to detect Wickerbottom-style reading, it cannot be done via ListenForEvent — it would require a Lua mechanic module hooking reader:SetOnReadFn / AddComponentPostInit("reader") to fire a custom event.
