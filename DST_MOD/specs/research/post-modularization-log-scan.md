# Post-modularization server/client log scan

> Saved from workflow `Scan DST server+client logs for errors after the mod modularization, verify each finding against the raw log`. Raw multi-agent research output;
> see the sibling specs for the distilled conclusions.

## angles

**1.** 
  - **angle:** lua-errors
  - **overall:** Clean bill of health for the DSTP angle. Across all three logs (master_server_log.txt 693 lines, caves_server_log.txt 597 lines, client_log.txt 434 lines) there are ZERO Lua runtime errors attributable to DSTP — no stack tracebacks, no 'attempt to index/call a nil value', no '[error]'/'LUA ERROR'/'SCRIPT ERROR' frames, no 'scripts/...lua:NN' error frames, and no strict-mode 'Variable X is not declared'. A regex sweep for every one of those patterns returned no matches in any of the three files. Critically, the refactored mod (the 7-module split with dependency injection: core/collectors/commands/events/chat/http/client) booted cleanly on BOTH shards: the full '=== DSTP Admin Panel ===' banner printed intact with Server ID, Shard, Backend, Poll, and Debug-logs lines (master line 610, caves line 521). Because the banner is emitted at the END of the init chain, its complete and uninterrupted printing is positive proof that Core.Init -> Collectors.Init -> Commands.RegisterAll -> Chat.Init -> Events.Init -> Http.Init all succeeded — any nil-index from a mis-wired DI handoff or any strict-mode declaration miss in the split would have aborted before the banner. On the client side, the DSTP UI renderer completed a full create->destroy lifecycle for two trees ('wallet', 'shop') with matching teardown and no nil-index on destroy. The only non-DSTP anomalies are ordinary engine noise — vanilla 'Could not find anim [death/idle_loop/transform]' ghost/wilson messages and a transient secondary-shard 'Connection to master failed' retry that resolves 5s later — none of which are Lua runtime errors. Note these are short ~3-10 minute capture windows, so this only proves a clean boot + light UI exercise, not exhaustive runtime coverage of all 40+ commands/event paths.
  - **findingCount:** 6
  - **confirmed:** _(empty)_
  - **refuted:** _(empty)_
  - **allFindings:** 
    **1.** 
      - **file:** master_server_log.txt
      - **excerpt:** [00:00:32]: [DSTP] === DSTP Admin Panel ===
[00:00:32]: [DSTP] Server ID: dst-78E443896291
[00:00:32]: [DSTP] Shard: dst-78E443896291:master (master)
[00:00:32]: [DSTP] Backend: http://127.0.0.1:47834
[00:00:32]: [DSTP] Poll: 0.1s
[00:00:32]: [DSTP] Debug logs: OFF
      - **line:** 610
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Refactored DSTP mod booted CLEANLY on the master shard. The full banner printing (with Server ID, Shard, Backend, Poll) means the entire init chain (Core.Init -> Collectors.Init -> Commands.RegisterAll -> Chat.Init -> Events.Init -> Http.Init) ran to completion with NO error. A failure in any required-before-banner Init step (e.g. a nil-index from a broken dependency-injection wire, or a strict-mode 'not declared' from the module split) would have thrown a traceback BEFORE this line and aborted the banner. It printed fully and uninterrupted, so the 7-module split + DI did not break boot. No runtime error here.
    **2.** 
      - **file:** caves_server_log.txt
      - **excerpt:** [00:00:31]: [DSTP] === DSTP Admin Panel ===
[00:00:31]: [DSTP] Server ID: dst-346B4035287A
[00:00:31]: [DSTP] Shard: dst-346B4035287A:caves (caves)
[00:00:31]: [DSTP] Backend: http://127.0.0.1:47834
[00:00:31]: [DSTP] Poll: 0.1s
[00:00:31]: [DSTP] Debug logs: OFF
      - **line:** 521
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Same clean boot on the SECONDARY (caves) shard — banner printed fully, no traceback before or after. Confirms the refactor's init chain works on both shard roles, not just master. No runtime error.
    **3.** 
      - **file:** client_log.txt
      - **excerpt:** [00:08:15]: [DSTP UI] created tree 'wallet'
[00:08:19]: [DSTP UI] created tree 'shop'
[00:08:27]: [DSTP UI] destroyed 'shop'
[00:08:27]: [DSTP UI] destroyed group 'shop' (1 widgets)
      - **line:** 427
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Client-side DSTP UI renderer worked: it built two generic UI trees ('wallet', 'shop') pushed from the backend via net_string and tore them down cleanly with matching destroy lines (no orphaned-widget or nil-index error on destroy). The full create->destroy lifecycle ran without a Lua error. This is the only DSTP client-side runtime activity in the log and it is healthy.
    **4.** 
      - **file:** master_server_log.txt
      - **excerpt:** [00:01:41]: Could not find anim [death] in bank [ghost]
[00:01:42]: Could not find anim [idle_loop] in bank [ghost]
[00:01:44]: Could not find anim [transform] in bank [wilson]
      - **line:** 686
      - **severity:** info
      - **dstp_related:** false
      - **summary:** Vanilla DST asset noise, NOT a Lua runtime error and NOT DSTP. 'Could not find anim' for ghost/wilson banks is a benign engine message that fires on normal death/respawn/transform animation playback when an anim isn't present in the streamed bank. Occurs in the base game without any mod. Listed only to explicitly classify it as non-DSTP noise so it isn't mistaken for a mod fault.
    **5.** 
      - **file:** caves_server_log.txt
      - **excerpt:** [00:00:31]: [Shard] Connection to master failed. Waiting to reconnect...
      - **line:** 512
      - **severity:** info
      - **dstp_related:** false
      - **summary:** Vanilla shard-startup race, NOT a Lua error and NOT DSTP. The caves (secondary) shard's first connect attempt to the master happens before the master's shard port is up, so DST retries and succeeds 5s later ('secondary shard is now ready!' at 00:00:37, 'World 1(Master) is now connected'). This is normal multi-shard boot ordering. Included only to classify it as expected engine noise.
    **6.** 
      - **file:** caves_server_log.txt
      - **excerpt:** [00:00:09]: Could not load mod_config_data/modconfiguration_DSTP
      - **line:** 372
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Benign and expected, NOT an error. On a dedicated server the per-mod cached config blob isn't present, so DST falls back to the configuration_options supplied by modoverrides.lua (the immediately preceding 'Overriding mod DSTP's option ...' lines show all options applied correctly: EVT_PLAYERS=true, EVT_WORLD=true, EVT_CHAT=true, POLL_INTERVAL=0.1, etc.). 'Could not load mod_config_data' is the standard dedicated-server path and does not affect the mod. Same line appears on master (line 189/465). No runtime impact.
**2.** 
  - **angle:** module-load
  - **overall:** Module loading of the refactored 7-module DSTP mod is HEALTHY and the boot sequence COMPLETED on both shards. On master the boot banner appears at line 610 of master_server_log.txt and runs to the very end: header, Server ID (dst-78E443896291), Shard (master), Backend, Poll, Debug logs, separator, provisional Panel URL, and the relay-refined Panel URL (line 629) — which is the last optional step before RegisterGameEvents/HookChat/Http.Start. Caves shows the identical complete banner (caves_server_log.txt lines 521-533) with shard_type correctly 'caves'. Reaching the banner proves the full Init chain (Core.Init -> Collectors.Init -> Commands.RegisterAll -> Chat.Init -> Events.Init -> Http.Init) ran without error, and a clean modmain.lua load + 'dstp' namespace registration proves all 7 require()'d modules (core/collectors/commands/events/chat/http + client glue) loaded successfully. There is ZERO evidence of 'unexpected require', 'module not found', a failed require of any dstp submodule, an attempt-to-call/index-nil, a stack traceback, or the banner starting but stalling before the Server ID/Shard/Poll lines. The only non-DSTP noise is vanilla fresh-save messages (morgue/player_history/server_preferences could-not-load) and the standard 'Could not load modconfiguration_DSTP' (config comes from modoverrides instead), both harmless. Note: master and caves report different Server IDs because each shard derives its auto-id from its own world session_identifier — expected behavior of the auto-id path, not a defect. Boot confirmed reached the end on both shards.
  - **findingCount:** 6
  - **confirmed:** _(empty)_
  - **refuted:** _(empty)_
  - **allFindings:** 
    **1.** 
      - **file:** master_server_log.txt
      - **excerpt:** [00:00:32]: [DSTP] === DSTP Admin Panel ===
[00:00:32]: [DSTP] Server ID: dst-78E443896291
[00:00:32]: [DSTP] Shard: dst-78E443896291:master (master)
[00:00:32]: [DSTP] Backend: http://127.0.0.1:47834
[00:00:32]: [DSTP] Poll: 0.1s
[00:00:32]: [DSTP] Debug logs: OFF
[00:00:32]: [DSTP] ============================================
[00:00:32]: [DSTP]   DSTP Panel: https://dstp.marcosbrendon.com/?server=dst-78E443896291
[00:00:32]: [DSTP] ============================================
      - **severity:** info
      - **line:** 610
      - **dstp_related:** true
      - **summary:** MASTER boot banner appears and COMPLETES end-to-end. Every required line of the boot sequence is present and in order: banner header, Server ID, Shard (correctly resolved to shard_type 'master'), Backend, Poll, Debug logs, separator, and the provisional Panel URL. This block is emitted by LogInfo() calls inside the DoTaskInTime(0) closure in client.lua DSTP.Init (lines 157-168), which runs only AFTER Core.Init -> Collectors.Init -> Commands.RegisterAll -> Chat.Init -> Events.Init -> Http.Init all completed earlier in Init. Reaching this banner proves all 7 modules (core/collectors/commands/events/chat/http + client glue) were require()'d and Init'd without error.
    **2.** 
      - **file:** master_server_log.txt
      - **excerpt:** [00:00:32]: [DSTP]   DSTP Panel (via relay): http://localhost:3000/?server=dst-78E443896291
      - **severity:** info
      - **line:** 629
      - **dstp_related:** true
      - **summary:** The relay-status callback fired and succeeded: the mod queried 127.0.0.1:47834/relay-status, got a 200 with upstream=http://localhost:3000, and refined the panel URL. This is the LAST optional step of the boot closure (client.lua lines 175-184) and confirms Http was initialized and the QueryServer bridge is live. Boot definitively reached the end — RegisterGameEvents, Chat.HookChat (master only), and Http.Start all run right after this in the same closure.
    **3.** 
      - **file:** caves_server_log.txt
      - **excerpt:** [00:00:31]: [DSTP] === DSTP Admin Panel ===
[00:00:31]: [DSTP] Server ID: dst-346B4035287A
[00:00:31]: [DSTP] Shard: dst-346B4035287A:caves (caves)
[00:00:31]: [DSTP] Backend: http://127.0.0.1:47834
[00:00:31]: [DSTP] Poll: 0.1s
[00:00:31]: [DSTP] Debug logs: OFF
[00:00:31]: [DSTP] ============================================
[00:00:31]: [DSTP]   DSTP Panel: https://dstp.marcosbrendon.com/?server=dst-346B4035287A
[00:00:31]: [DSTP] ============================================
[00:00:31]: [DSTP]   DSTP Panel (via relay): http://localhost:3000/?server=dst-346B4035287A
      - **severity:** info
      - **line:** 521
      - **dstp_related:** true
      - **summary:** CAVES (secondary shard) boot banner also appears and COMPLETES with all lines present, and correctly resolves shard_type='caves'. The same full Init chain ran on the caves shard. The relay-status refinement also succeeded here (line 533). Confirms the refactored module set boots identically on both shards.
    **4.** 
      - **file:** master_server_log.txt
      - **excerpt:** [00:00:02]: Loading mod: DSTP (DSTP - Admin Panel) Version:0.6.0
[00:00:02]: Mod: DSTP (DSTP - Admin Panel)	Loading modmain.lua
[00:00:04]: Registering Server mod namespace "dstp"
[00:00:06]: Mod: DSTP (DSTP - Admin Panel)	Registering prefabs
      - **severity:** info
      - **line:** 104
      - **dstp_related:** true
      - **summary:** modmain.lua loaded cleanly and ran to completion: the 'dstp' namespace registers (line 131) and prefabs register (line 141) with no interleaved error. Because client.lua require()s all 7 submodules (core/collectors/commands/events/chat/http via the local Core/Collectors/Commands/Http/Chat/Events declarations at the top, lines 13-74) at the moment modmain require()s the client module, a successful modmain load proves none of those require() calls raised 'module not found' or a parse/strict-mode error. No 'unexpected require', no 'attempt to call/index a nil value', no stack traceback anywhere in the log.
    **5.** 
      - **file:** master_server_log.txt
      - **excerpt:** [00:00:04]: PlayerDeaths could not load morgue
[00:00:04]: PlayerHistory could not load player_history
[00:00:04]: ServerPreferences could not load server_preferences
[00:00:04]: ConsoleScreenSettings could not load consolescreen
      - **severity:** info
      - **line:** 132
      - **dstp_related:** false
      - **summary:** Vanilla DST noise on a fresh save: these subsystems simply have no persisted file yet on first boot. NOT DSTP-related and not a require failure (it's a save-file load, not a Lua module load). Also 'Could not load mod_config_data/modconfiguration_DSTP' (lines 103/189/465) is the normal vanilla message when config comes from modoverrides.lua rather than a saved config blob — harmless, the overrides are applied correctly right after (lines 105-122).
    **6.** 
      - **file:** client_log.txt
      - **excerpt:** [00:06:52]: Fontend-Loading mod: DSTP (DSTP - Admin Panel) Version:0.6.0
[00:07:38]: Loading mod: DSTP (DSTP - Admin Panel) Version:0.6.0
      - **severity:** info
      - **line:** 221
      - **dstp_related:** true
      - **summary:** Client-side mod load is clean. The server-side boot banner ('=== DSTP Admin Panel ===') correctly does NOT appear in the client log — it is emitted only on the master sim inside the world-prefab postinit (ismastersim gated), so its absence client-side is expected, not a halt. No DSTP Lua errors, no 'attempt to call/index nil', no '[string ...]' from dstp modules, and no failed require on the client.
**3.** 
  - **angle:** runtime-behavior
  - **overall:** The refactored 7-module DSTP mod is ALIVE and healthy — no evidence of a regression from the split into core/collectors/commands/events/chat/http/client. The boot banner appears on BOTH shards (master line 610, caves line 521), which only prints at the very end of the DI init chain, proving every module's Init() ran without throwing. The HTTP bridge is provably functional: the one-shot /relay-status QueryServer succeeded and parsed the relay's upstream (master line 629, caves line 533), confirming TheSim:QueryServer, the relay forward path, and json.decode all work. There are ZERO '[DSTP ERROR]' lines and ZERO 'Connection failed' lines in either server log — and since LogError prints unconditionally regardless of DEBUG, their absence means no handler threw, no payload failed to encode, and the sync poll logged no connection failure (successful polls are silent with DEBUG_LOGS=OFF). The decisive end-to-end proof is on the client: '[DSTP UI] created tree wallet/shop' (client_log 427-430) are backend-pushed widgets, so the complete loop — poll -> backend response -> ProcessCommands -> net_string -> client render — demonstrably round-tripped while a player was connected. The only nuance (not a bug) is that the sim-clock-driven poll loop freezes during DST's PauseWhenEmpty pauses (empty at 00:00:32, idle 'Server Paused' at 00:03:44), which is expected and matches the mod's own idle-throttle design. The chat hook, per-player event listeners, and command registration produce no log output by design when DEBUG is off, but the clean boot + working command dispatch (UI commands executed) indicate they wired up correctly. Net: the mod looks fully operational, not silently dead.
  - **findingCount:** 6
  - **confirmed:** _(empty)_
  - **refuted:** _(empty)_
  - **allFindings:** 
    **1.** 
      - **file:** master_server_log.txt
      - **line:** 610
      - **excerpt:** [00:00:32]: [DSTP] === DSTP Admin Panel ===
[00:00:32]: [DSTP] Server ID: dst-78E443896291
[00:00:32]: [DSTP] Shard: dst-78E443896291:master (master)
[00:00:32]: [DSTP] Backend: http://127.0.0.1:47834
[00:00:32]: [DSTP] Poll: 0.1s
[00:00:32]: [DSTP] Debug logs: OFF
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Boot banner fires cleanly on the master shard. This is the LogInfo() block from the world-postinit's DoTaskInTime(0) in client.lua:157-168, which runs only AFTER the full DI boot chain (Core.Init -> Collectors.Init -> Commands.RegisterAll -> Chat.Init -> Events.Init -> Http.Init). Its presence proves the entire refactored module init sequence completed without throwing — a mid-chain error would have aborted before this banner. Server ID was auto-resolved from session_identifier (dst- + first 12 chars), shard_type correctly detected as master, and DEBUG is OFF (so successful polls/event-registrations are intentionally silent from here on).
    **2.** 
      - **file:** caves_server_log.txt
      - **line:** 521
      - **excerpt:** [00:00:31]: [DSTP] === DSTP Admin Panel ===
[00:00:31]: [DSTP] Server ID: dst-346B4035287A
[00:00:31]: [DSTP] Shard: dst-346B4035287A:caves (caves)
[00:00:31]: [DSTP] Backend: http://127.0.0.1:47834
[00:00:31]: [DSTP] Poll: 0.1s
      - **severity:** info
      - **dstp_related:** true
      - **summary:** The caves (secondary) shard ALSO booted the mod cleanly and correctly self-identified shard_type='caves' via inst:HasTag('cave') in client.lua:126. Note each shard generates its OWN server_id from its own session_identifier (master=dst-78E443896291, caves=dst-346B4035287A) because the auto-id is derived per-shard before the shards link. This is existing/expected behavior of the auto-id scheme, not introduced by the refactor; the backend groups by server_id so the two shards appear under distinct ids unless overridden — worth being aware of but not a regression in these logs.
    **3.** 
      - **file:** master_server_log.txt
      - **line:** 629
      - **excerpt:** [00:00:32]: [DSTP]   DSTP Panel (via relay): http://localhost:3000/?server=dst-78E443896291
      - **severity:** info
      - **dstp_related:** true
      - **summary:** HARD PROOF the HTTP bridge works end-to-end. This line is only printed inside the QueryServer callback in client.lua:175-184 when the GET to http://127.0.0.1:47834/relay-status returns is_ok && http_code==200 && a JSON body whose parsed.upstream is a non-empty string. So: (a) TheSim:QueryServer reached the relay on loopback, (b) the relay answered 200, (c) json.decode succeeded, (d) upstream was read as http://localhost:3000. The relay is alive and forwarding, and the mod's HTTP + JSON-decode path is functional. The caves shard shows the identical success at line 533.
    **4.** 
      - **file:** master_server_log.txt
      - **line:** 610
      - **excerpt:** (no "[DSTP ERROR]" line appears anywhere in master_server_log.txt or caves_server_log.txt)
      - **severity:** info
      - **dstp_related:** true
      - **summary:** ABSENCE OF ERRORS is itself a strong signal. Every failure path in the refactored mod routes through Core.LogError() which prints the literal prefix '[DSTP ERROR]' UNCONDITIONALLY (core.lua:74-76, independent of DEBUG). That covers: JSON encode/decode failures (SafeEncode/SafeDecode), unknown commands, command-handler pcall failures (ExecuteCommand), and the poll loop's 'Connection failed (attempt N)' (http.lua:91). None appear. So no command handler threw, no payload failed to serialize, and the poll loop logged no connection failure. Combined with the successful relay-status call, the sync poll to the same relay host:port is succeeding silently (successful polls don't log when DEBUG=OFF).
    **5.** 
      - **file:** client_log.txt
      - **line:** 427
      - **excerpt:** [00:08:15]: [DSTP UI] created tree 'wallet'
[00:08:19]: [DSTP UI] created tree 'shop'
[00:08:27]: [DSTP UI] destroyed 'shop'
[00:08:27]: [DSTP UI] destroyed group 'shop' (1 widgets)
      - **severity:** info
      - **dstp_related:** true
      - **summary:** STRONGEST end-to-end liveness evidence — the full bidirectional loop is working. These client-side UI trees are not created locally; they are pushed FROM the backend: backend returns a ui_command in the /api/dst/sync response -> mod's Http.DoPoll callback -> Core.ProcessCommands -> ui_command handler -> player_classified._dstp_ui net_string -> client ui_widgets renderer logs '[DSTP UI] created tree ...'. For 'wallet' and 'shop' to render on the client, the server must have (1) polled the backend, (2) received commands, (3) processed and coalesced them per-userid, and (4) delivered them via net_string. This confirms the poll loop, command dispatch, and net_string channel are all alive while a player is connected. (These match the shop/wallet example flows referenced in CLAUDE.md.)
    **6.** 
      - **file:** master_server_log.txt
      - **line:** 630
      - **excerpt:** [00:00:32]: Sim paused
... 
[00:01:16]: Sim unpaused
... 
[00:03:44]: Server Paused
      - **severity:** info
      - **dstp_related:** false
      - **summary:** Vanilla DST pause behavior, NOT a DSTP bug, but relevant to interpreting poll cadence. With PauseWhenEmpty:true (line 184), the sim pauses when no player is present (00:00:32, right after boot) and again when the player goes idle (Server Paused 00:03:44). The mod's poll loop is driven by inst:DoTaskInTime (http.lua:120-132), which is sim-clock based and therefore freezes while the sim is paused. The refactored boot deliberately forces TheSim:SetTimeScale(1) at client.lua:155 to avoid a previous-session paused state freezing the loop, and the first poll is scheduled at +2s. The relay-status QueryServer still completed at 00:00:32 and UI round-trips worked at 00:08:xx, so this pause behavior is benign here — just expect near-zero polling during empty/idle windows, which is the intended idle-throttle (ComputeNextDelay returns 30s when no clients, http.lua:29).
**4.** 
  - **angle:** caves-shard
  - **overall:** The caves shard is healthy and behaves exactly as the refactored mod intends. It booted the 7-module DSTP mod (v0.6.0) cleanly, correctly detected shard_type="caves" (caves_server_log.txt:523), and printed its full LogInfo boot banner (521-533) — which is emitted at the tail of the DI boot chain right before RegisterGameEvents + Http.Start, so its full appearance plus an error-free subsequent run is strong evidence that caves registered its own world/game-event listeners and started its own poll loop. Critically, the chat double-hook is impossible here: Chat.HookChat() (the only place Networking_Say is wrapped) is gated behind shard_type=="master" (client.lua:192), and caves resolved to "caves", so it is never called — confirmed by the total absence of any Networking_Say / HookChat / chat_message trace in the caves log. There are ZERO [DSTP ERROR] lines (Core.LogError always prints, so a real fault would surface) and zero Lua errors on caves. One interpretation caveat: debug logs are OFF, so per-listener registration lines (emitted via the debug-gated Log()) are silent by design — their absence is expected, not a red flag, and there is no explicit "chat skipped" line because the skip is a silent no-op. The only non-DSTP noise is a transient vanilla "[Shard] Connection to master failed" that self-resolves seconds later, and the fact that no player ever entered caves (so the per-player hook path simply wasn't exercised). Compared to master (which correctly reports shard_type="master" and is the sole chat owner), the gating works as designed end to end.
  - **findingCount:** 8
  - **confirmed:** _(empty)_
  - **refuted:** _(empty)_
  - **allFindings:** 
    **1.** 
      - **file:** caves_server_log.txt
      - **line:** 523
      - **excerpt:** [00:00:31]: [DSTP] Shard: dst-346B4035287A:caves (caves)
      - **severity:** info
      - **dstp_related:** true
      - **summary:** The caves shard booted the refactored DSTP mod and correctly self-identified as shard_type="caves". This is set in client.lua's world AddPrefabPostInit via inst:HasTag("cave") (line 127) and is the gate that controls chat hooking. Because it resolved to "caves" (not "master"), the master-only Chat.HookChat() branch at client.lua:192 (`if config.shard_type == "master" then Chat.HookChat() end`) is NOT taken on this shard. Compared to master (master_server_log.txt:612 shows "...:master (master)"), the two shards differ exactly as intended. This is the core verification: caves cannot double-hook chat because HookChat — the only thing that wraps Networking_Say — is never called here.
    **2.** 
      - **file:** caves_server_log.txt
      - **line:** 521
      - **excerpt:** [00:00:31]: [DSTP] === DSTP Admin Panel ===
[00:00:31]: [DSTP] Server ID: dst-346B4035287A
[00:00:31]: [DSTP] Shard: dst-346B4035287A:caves (caves)
[00:00:31]: [DSTP] Backend: http://127.0.0.1:47834
[00:00:31]: [DSTP] Poll: 0.1s
[00:00:31]: [DSTP] Debug logs: OFF
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Full boot banner printed on caves. This banner is emitted by LogInfo (always prints) from INSIDE the world-postinit DoTaskInTime(0) callback, AFTER the full DI boot chain (Core.Init -> Collectors -> Commands.RegisterAll -> Chat.Init -> Events.Init -> Http.Init) and immediately before RegisterGameEvents(inst), the chat gate, and Http.Start(inst). The banner appearing in full (and the sim continuing to run with no error/connection-failure spam afterward) is strong evidence the entire postinit completed without throwing — i.e. caves successfully registered its own world/game-event listeners via RegisterGameEvents and started its own poll loop. Note the banner is at line 521 here, not ~610 (that's master); ~610 was the orientation hint for the master log.
    **3.** 
      - **file:** caves_server_log.txt
      - **line:** 533
      - **excerpt:** [00:00:31]: [DSTP]   DSTP Panel (via relay): http://localhost:3000/?server=dst-346B4035287A
      - **severity:** info
      - **dstp_related:** true
      - **summary:** The relay-status QueryServer round-trip succeeded on caves (the /relay-status call in client.lua resolved upstream to http://localhost:3000, overriding the provisional prod URL). This proves caves' QueryServer/HTTP path is alive and the relay answered — caves is fully wired to the backend independently of master. No errors followed.
    **4.** 
      - **file:** caves_server_log.txt
      - **line:** 526
      - **excerpt:** [00:00:31]: [DSTP] Debug logs: OFF
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Important interpretation caveat: debug logs are OFF, so Core.Log() (the debug-gated logger) is suppressed. Per-listener / per-player-hook registration lines are emitted via Log(), not LogInfo(), so their ABSENCE in the caves log is by-design and is NOT evidence that listeners failed. The positive evidence that listeners registered is indirect but sound: the LogInfo boot banner prints fully and the sim runs error-free, and RegisterGameEvents runs unconditionally before Http.Start in the same callback. There is no DSTP-emitted line that explicitly says "chat hook skipped" — the skip is silent by design (the gate just doesn't call HookChat).
    **5.** 
      - **file:** caves_server_log.txt
      - **line:** 1
      - **excerpt:** (no occurrences of: [DSTP ERROR], Networking_Say, HookChat, chat_message, SCRIPT ERROR, stack traceback, 'attempt to ... a nil value', or '[string "..."]' anywhere in caves_server_log.txt)
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Negative-evidence sweep: the caves log contains ZERO [DSTP ERROR] lines (Core.LogError always prints, so any JSON encode/decode failure, command execution error, or connection failure would be visible), zero Lua runtime errors, and zero chat-subsystem traces (no Networking_Say wrap, no chat_message push, no HookChat). The complete absence of any chat-related line on caves is exactly what a correctly-gated shard looks like: chat machinery only exists on master. No shard-specific DSTP errors of any kind.
    **6.** 
      - **file:** master_server_log.txt
      - **line:** 612
      - **excerpt:** [00:00:32]: [DSTP] Shard: dst-78E443896291:master (master)
      - **severity:** info
      - **dstp_related:** true
      - **summary:** Master comparison point: master resolves shard_type="master", so it IS the shard that calls Chat.HookChat() (client.lua:192). This is the intended single chat owner. Together with caves resolving to "caves", the pair confirms exactly-one-hook behavior: master hooks Networking_Say, caves does not. Note master and caves report DIFFERENT auto server IDs (dst-78E443896291 vs dst-346B4035287A) because each derives its own from its own world session_identifier — expected for the auto-id path; the backend groups shards by server_id, and these two logs are from two different cluster sessions rather than one paired cluster, but the shard-gating logic is identical and correct in both.
    **7.** 
      - **file:** caves_server_log.txt
      - **line:** 594
      - **excerpt:** [00:00:38]: Sim unpaused
[00:01:41]: Start world reset countdown... 120 seconds...
[00:03:44]: Server Paused
      - **severity:** info
      - **dstp_related:** false
      - **summary:** Caves ran cleanly to the end of the capture (sim active, then a normal PauseWhenEmpty pause at 03:44). No player ever connected to caves (no 'incoming connection' / 'Spawning player' lines), so the per-player event-registration path (RegisterPerPlayerEvents) was simply never exercised underground — the player stayed in the overworld (see master log line 684 'Spawning player'). This is normal, not a defect: caves correctly registered its WORLD-level listeners at boot; per-player hooks only fire when a player descends. Nothing here is attributable to DSTP.
    **8.** 
      - **file:** caves_server_log.txt
      - **line:** 512
      - **excerpt:** [00:00:31]: [Shard] Connection to master failed. Waiting to reconnect...
      - **severity:** info
      - **dstp_related:** false
      - **summary:** Vanilla DST shard-startup noise, NOT a DSTP issue. The secondary (caves) shard transiently fails to reach the master on its first attempt at 00:31 and successfully connects at 00:36-00:37 ('secondary shard is now ready!', 'World 1(Master) is now connected'). This is the standard race between master and secondary boot order and resolves on its own. Included only to pre-empt mis-attribution to the mod.
