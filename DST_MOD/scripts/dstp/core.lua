-- DSTP Core — shared state + ubiquitous helpers for the mod's submodules.
--
-- This is the dependency-injection hub. The mod's pieces (collectors, commands,
-- events, http) are split into their own files; each `require("dstp/core")` and
-- reads shared state/helpers from this single table. `core` is a singleton (require
-- caches it) passed BY REFERENCE — so when DSTP.Init does `core.Init(GLOBAL, json,
-- config)`, every submodule that held the reference sees `_G`/`json`/config filled
-- in. A submodule never copies `_G` directly (it'd be nil pre-Init); it always reads
-- `core._G`. Mirrors how land_claims.lua is required once and shared.
--
-- Holds: connection state, config, event-category gating, the event queue +
-- debounce, the command registry, per-player hook tracking, and the LandClaims ref.
-- Provides: logging, JSON encode/decode, a safe table dump, FindPlayer, the event
-- queue (PushEvent), and the command system (RegisterCommand/Execute/Process).

local Core = {}

-- ── Injected globals (nil until Init) ──
Core._G = nil
Core.json = nil

-- ── Shared state ──
Core.state = {
    connected = false,
    connection_errors = 0,
    last_successful_poll = 0,
    event_queue = {},
    poll_in_flight = false,  -- true while a /dst/sync POST is awaiting its callback
}

Core.config = {
    server_id = nil,
    shard_id = nil,    -- auto: server_id:master or server_id:caves
    shard_type = nil,  -- "master" or "caves"
    backend_url = "http://127.0.0.1:3000",
    panel_url_base = nil,  -- public URL for browser links; defaults to backend_url
    poll_interval = 5,
    max_batch_size = 50,
    dump_mode = false,  -- when true, events include raw DST data
    debug_logs = false,  -- when true, Log() prints to server log; errors always print
    allow_execute = true,   -- gate for the `execute` command (arbitrary Lua RCE). ON by
                            -- default (no functional regression for flows already using it);
                            -- a paranoid server can turn it OFF via modinfo ALLOW_EXECUTE.
                            -- The loop-infinite watchdog (RunGuarded) is ALWAYS on regardless.
    max_execute_ops = 2000000,  -- instruction budget for guarded Lua (execute/call_component);
                                -- a runaway loop is aborted past this. ~DST's 20000 default is
                                -- for tiny sandboxed snippets; ours run real admin code so the
                                -- budget is far higher but still finite (no master-sim freeze).
}

-- Chat command prefix: a message starting with this is treated as a flow command —
-- it still fires chat_message (so flows react) but is NOT broadcast to public chat.
-- We use "!" because the game leaves it alone (it passes through Networking_Say).
Core.COMMAND_PREFIX = "!"

Core.command_handlers = {}
Core.evt_config = {}        -- category -> enabled (read by every event listener for gating)
Core.world_inst = nil       -- TheWorld, set when events register
Core.hooked_players = {}     -- userid -> true (prevents double-registering per-player events)
Core.LandClaims = nil        -- dstp/land_claims singleton, set in Init()

-- Module-local debug flag. Updated by Init() from mod config.
-- Use `if Core.DEBUG then Core.Log(...) end` around expensive log lines to avoid
-- string concatenation/tostring() cost when debug is off.
Core.DEBUG = false

-------------------------------------------------
-- Logging
--
-- HOT-PATH RULE: always gate Log() calls with `if Core.DEBUG then ... end` so the
-- string concatenation never runs when debug is off.
--
-- Log()      — debug-only (gated via Core.DEBUG)
-- LogError() — always prints (errors should never be silent)
-- LogInfo()  — always prints (boot banners, critical warnings)
-------------------------------------------------
function Core.Log(msg)
    if Core.DEBUG then
        print("[DSTP] " .. msg)
    end
end

function Core.LogError(msg)
    print("[DSTP ERROR] " .. msg)
end

function Core.LogInfo(msg)
    print("[DSTP] " .. msg)
end

-------------------------------------------------
-- JSON helpers
-------------------------------------------------
function Core.SafeEncode(data)
    local ok, result = pcall(Core.json.encode, data)
    if ok then return result end
    Core.LogError("JSON encode failed: " .. tostring(result))
    return nil
end

function Core.SafeDecode(str)
    local ok, result = pcall(Core.json.decode, str)
    if ok then return result end
    Core.LogError("JSON decode failed: " .. tostring(result))
    return nil
end

-------------------------------------------------
-- Event Queue (with debounce)
-------------------------------------------------

-- Debounce config: event_type -> minimum seconds between events.
-- Updated remotely via sync response.
Core.event_debounce = {
    phase_changed = 1,
    season_changed = 5,
    health_delta = 1,
    hunger_delta = 1,
    sanity_delta = 1,
    storm_changed = 5,
    precipitation = 5,
}
local last_event_time = {} -- event_type -> last GetTime()

-- Safe dump of a Lua table (handles entities, userdata, circular refs)
function Core.SafeDump(obj, depth, seen)
    if depth and depth > 3 then return "<max depth>" end
    if obj == nil then return nil end
    local t = type(obj)
    if t == "string" or t == "number" or t == "boolean" then return obj end
    if t == "userdata" then return "<userdata>" end
    if t == "function" then return "<function>" end
    if t ~= "table" then return tostring(obj) end

    seen = seen or {}
    if seen[obj] then return "<circular>" end
    seen[obj] = true

    local result = {}
    local count = 0
    for k, v in pairs(obj) do
        local key = type(k) == "string" and k or tostring(k)
        -- Skip internal/heavy fields
        if key ~= "entity" and key ~= "Transform" and key ~= "AnimState" and key ~= "Physics"
           and key ~= "SoundEmitter" and key ~= "Network" and key ~= "Light" and key ~= "DynamicShadow"
           and not key:match("^_") then
            if count >= 20 then result["..."] = "truncated"; break end
            result[key] = Core.SafeDump(v, (depth or 0) + 1, seen)
            count = count + 1
        end
    end

    -- Add useful entity info if available
    if obj.prefab then result["_prefab"] = obj.prefab end
    if obj.userid then result["_userid"] = obj.userid end
    if obj.name and type(obj.name) == "string" then result["_name"] = obj.name end
    if obj.GUID then result["_GUID"] = obj.GUID end

    return result
end

function Core.PushEvent(event_type, data, raw_data)
    -- Debounce check. The key includes the player's userid when present, so the
    -- debounce is PER-PLAYER (#2): without it, the global per-type timer meant
    -- player B's health_delta was dropped because player A's was within the window.
    -- World/global events (no userid) keep the plain per-type key.
    local debounce = Core.event_debounce[event_type]
    if debounce then
        local uid = type(data) == "table" and data.userid
        local key = (uid and uid ~= "") and (event_type .. ":" .. uid) or event_type
        local now = Core._G.GetTime()
        local last = last_event_time[key] or 0
        if now - last < debounce then
            return -- skip, too soon
        end
        last_event_time[key] = now
    end

    -- Merge raw DST data into event data so flows have access to everything.
    -- Only merge plain data tables, NOT entity objects (which have GUID/entity/Transform)
    local merged = data or {}
    if raw_data and type(raw_data) == "table" and not raw_data.GUID and not raw_data.entity then
        local ok, dumped = pcall(Core.SafeDump, raw_data)
        if ok and type(dumped) == "table" then
            for k, v in pairs(dumped) do
                if merged[k] == nil then
                    merged[k] = v
                end
            end
        end
    end

    local event = {
        type = event_type,
        timestamp = Core._G.GetTime(),
        data = merged,
    }

    -- If dump mode is active, also keep the full raw separately
    if Core.config.dump_mode and raw_data then
        local ok, dumped = pcall(Core.SafeDump, raw_data)
        if ok then
            event.raw = dumped
        end
    end

    table.insert(Core.state.event_queue, event)
    while #Core.state.event_queue > Core.config.max_batch_size * 2 do
        table.remove(Core.state.event_queue, 1)
    end

    -- Request an immediate flush so the next scheduled poll fires fast.
    Core.state.flush_requested = true
end

-------------------------------------------------
-- Command system
-------------------------------------------------
function Core.RegisterCommand(command_type, handler)
    Core.command_handlers[command_type] = handler
end

function Core.ExecuteCommand(cmd)
    local handler = Core.command_handlers[cmd.type]
    if not handler then
        Core.LogError("Unknown command: " .. tostring(cmd.type))
        return false
    end
    local ok, err = pcall(handler, cmd.data or {})
    if not ok then
        Core.LogError("Command '" .. cmd.type .. "' failed: " .. tostring(err))
        return false
    end
    return true
end

-- Run `fn` with an INSTRUCTION-COUNT watchdog so a runaway loop (`while true do end`)
-- in admin RCE (`execute`/`call_component`) can't freeze the single-threaded master
-- sim. This is DST's own technique (util.lua RunInSandboxSafeCatchInfiniteLoops uses
-- debug.sethook(co, ..., "", maxops)) — but we do NOT sandbox the environment: these
-- paths are admin RCE BY DESIGN (the gate is "an admin drew the flow"), so `fn` keeps
-- whatever env the caller gave it (e.g. _G). We only bound run time, not capability.
-- Returns (ok, err) like pcall. maxops defaults to config.max_execute_ops. If debug.
-- sethook is unavailable (debugger active / odd build), falls back to a plain pcall —
-- never worse than today, just without the loop guard.
function Core.RunGuarded(fn, maxops)
    local _G = Core._G
    maxops = maxops or Core.config.max_execute_ops or 2000000
    -- coroutine + debug.sethook is the only preemption Lua offers. Run fn in a fresh
    -- coroutine; the hook fires every `maxops` instructions and raises, which surfaces
    -- as a failed coroutine.resume.
    if not (_G.debug and _G.debug.sethook and _G.coroutine) then
        return pcall(fn)  -- no watchdog available; behave like before
    end
    local co = _G.coroutine.create(fn)
    _G.debug.sethook(co, function() _G.error("DSTP: instruction budget exceeded (possible infinite loop) — aborted") end, "", maxops)
    local results = { _G.coroutine.resume(co) }
    _G.debug.sethook(co)  -- clear the hook
    return results[1], results[2]
end

-- Per-player monotonic seq for the _dstp_ui envelope. A player's _dstp_ui net_string
-- holds a SINGLE value and replays its last value on reconnect/dirty re-fire, so the
-- client dedups by this seq (skip if seq <= last seen). We stamp it MOD-side (a simple
-- ++ per player) instead of relying on the backend's Date.now() — Date.now() is 1ms
-- resolution and COLLIDES for commands emitted in the same flow tick, which would make
-- the client drop legitimate co-tick commands. A mod-side counter is monotonic by
-- construction and resets together with the client (_seq=-1) on mod reload.
Core.ui_seq_by_user = Core.ui_seq_by_user or {}

-- Map a queued command to the _dstp_ui sub-command(s) it contributes, per target
-- player. Returns a list of { userid, sub } entries. Broadcasts (ui_broadcast,
-- install_rules_all) expand to EVERY player via _G.AllPlayers (the live list is
-- available here — ProcessCommands runs in the mod). Returns nil for commands that
-- are NOT _dstp_ui writers (those run normally via ExecuteCommand). The sub shapes
-- match exactly what the client router expects (commands.lua built these inline
-- before; we build them here so they can be coalesced). NOTE: the backend's per-command
-- `seq` is intentionally DROPPED — seq now lives only on the outer envelope.
local function UICommandTargets(cmd)
    local t, d = cmd.type, cmd.data
    if not d then return nil end
    if t == "ui_command" and d.userid and d.cmd then
        return { { userid = d.userid, sub = d.cmd } }
    elseif t == "ui_broadcast" and d.cmd then
        local out = {}
        for _, p in ipairs(Core._G.AllPlayers or {}) do
            if p.userid then out[#out + 1] = { userid = p.userid, sub = d.cmd } end
        end
        return out
    elseif t == "install_rules" and d.userid and d.rules then
        return { { userid = d.userid, sub = { action = "rules_install", rules = d.rules } } }
    elseif t == "install_rules_all" and d.rules then
        local out, sub = {}, { action = "rules_install", rules = d.rules }
        for _, p in ipairs(Core._G.AllPlayers or {}) do
            if p.userid then out[#out + 1] = { userid = p.userid, sub = sub } end
        end
        return out
    elseif t == "uninstall_rules" and d.userid and d.ids then
        return { { userid = d.userid, sub = { action = "rules_uninstall", ids = d.ids } } }
    elseif t == "set_player_state" and d.userid and d.key then
        return { { userid = d.userid, sub = { action = "state_set", key = d.key, value = d.value } } }
    end
    return nil
end

function Core.ProcessCommands(commands)
    if not commands then return end

    -- Coalesce ALL six _dstp_ui-writing families (ui_command, ui_broadcast,
    -- install_rules, uninstall_rules, set_player_state, install_rules_all) per player
    -- into ONE envelope, set once. Without this, any two writes to the same player's
    -- _dstp_ui in one sync clobber each other (single-value net_string) — only the last
    -- :set survived. Non-UI commands run normally, in order.
    local ui_by_user = {}        -- userid -> { sub_cmd, sub_cmd, ... }
    local ui_order = {}          -- preserve first-seen userid order

    for _, cmd in ipairs(commands) do
        local targets = UICommandTargets(cmd)
        if targets then
            for _, tgt in ipairs(targets) do
                local uid = tgt.userid
                if not ui_by_user[uid] then ui_by_user[uid] = {}; table.insert(ui_order, uid) end
                local c = tgt.sub
                -- Flatten a nested batch (an already-batched ui_command) so subs live
                -- at one level in the player's envelope.
                if c.action == "batch" and type(c.commands) == "table" then
                    for _, s in ipairs(c.commands) do table.insert(ui_by_user[uid], s) end
                else
                    table.insert(ui_by_user[uid], c)
                end
            end
        else
            if Core.DEBUG then Core.Log("Exec: " .. tostring(cmd.type)) end
            Core.ExecuteCommand(cmd)
        end
    end

    -- Flush ONE envelope per player, stamped with a fresh monotonic seq so the client
    -- can dedup a replayed net_string value. Always wrap in a batch (even a single sub)
    -- so the seq lives in one consistent place the client reads.
    for _, uid in ipairs(ui_order) do
        local subs = ui_by_user[uid]
        if #subs > 0 then
            local seq = (Core.ui_seq_by_user[uid] or 0) + 1
            Core.ui_seq_by_user[uid] = seq
            Core.ExecuteCommand({ type = "ui_command", data = { userid = uid,
                cmd = { action = "batch", commands = subs, seq = seq } } })
        end
    end
end

-------------------------------------------------
-- Player helpers
-------------------------------------------------
function Core.FindPlayer(userid)
    for _, player in ipairs(Core._G.AllPlayers) do
        if player.userid == userid then return player end
    end
    return nil
end

-- Private message to a player via the _dstp_pm net_string (shared by the
-- private_message command and the panel-link chat helper).
function Core.SendPrivateMessage(player, message)
    if not player or not player:IsValid() then return end
    if player.player_classified and player.player_classified._dstp_pm then
        player.player_classified._dstp_pm:set(message)
        if Core.DEBUG then Core.Log("PM to " .. tostring(player.name) .. ": " .. message) end
    end
end

-- key_pressed: SERVER half. The backend ships the watch set (which keys any flow
-- listens for) on /dst/sync; http.lua calls this. We fan it out to EVERY player's
-- dstp.keys net_string (JSON array) — the CLIENT half (keys.lua) reads it and
-- rebuilds its TheInput filter. The set is server-wide (same for everyone). Cached
-- in Core.current_watch_keys so late-joiners get it on spawn.
Core.current_watch_keys = nil  -- last JSON string pushed (for new players)
function Core.SetWatchKeys(list)
    if type(list) ~= "table" then list = {} end
    local json_str = Core.json and Core.json.encode(list) or "[]"
    Core.current_watch_keys = json_str
    for _, player in ipairs(Core._G.AllPlayers or {}) do
        Core.PushWatchKeysTo(player)
    end
    if Core.DEBUG then Core.Log("watch_keys -> " .. json_str) end
end

-- Push the cached watch set to one player's dstp.keys net_string (used by SetWatchKeys
-- for everyone, and on player spawn for late-joiners).
function Core.PushWatchKeysTo(player)
    if not player or not Core.current_watch_keys then return end
    if player.player_classified and player.player_classified._dstp_keys then
        player.player_classified._dstp_keys:set(Core.current_watch_keys)
    end
end

-------------------------------------------------
-- Init — inject the mod globals + config (called once by client.lua's DSTP.Init,
-- BEFORE any submodule's Init(core), so core._G/json/config are populated).
-------------------------------------------------
function Core.Init(GLOBAL, jsonlib, cfg)
    Core._G = GLOBAL
    Core.json = jsonlib
    if cfg then
        for k, v in pairs(cfg) do Core.config[k] = v end
    end
    Core.DEBUG = Core.config.debug_logs == true
end

return Core
