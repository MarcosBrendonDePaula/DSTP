-- DSTP Client - DST Admin Panel Bridge
-- Bidirectional HTTP polling: DST server <-> DSTP backend
-- Focus: player management (stats, inventory, equipment, position)

local DSTP = {}

-- Shared state + ubiquitous helpers now live in dstp/core (DI hub). We alias them
-- to module-locals so the ~700 internal call sites below stay unchanged. The TABLE
-- aliases (state/config/evt_config/...) point at core's tables BY REFERENCE — Init
-- mutates those tables in place, so the aliases stay live. The FUNCTION aliases are
-- stable (functions don't change). `_G`/`json` are reassigned at Init, so they're
-- aliased to module-locals set in DSTP.Init (same GLOBAL reference as core).
local Core = require("dstp/core")

local _G = nil  -- set in Init() (mirrors core._G; same GLOBAL ref)
local json = nil -- set in Init()

local state = Core.state
local config = Core.config
local COMMAND_PREFIX = Core.COMMAND_PREFIX
local command_handlers = Core.command_handlers
local evt_config = Core.evt_config
local hooked_players = Core.hooked_players
local event_debounce = Core.event_debounce
local LandClaims = nil  -- aliased from core in Init (set after require there)
local world_inst = nil  -- local mirror; events also set core.world_inst

-- Helper aliases (stable function refs from core)
local Log = Core.Log
local LogError = Core.LogError
local LogInfo = Core.LogInfo
local SafeEncode = Core.SafeEncode
local SafeDecode = Core.SafeDecode
local SafeDump = Core.SafeDump
local FindPlayer = Core.FindPlayer
local ExecuteCommand = Core.ExecuteCommand
local ProcessCommands = Core.ProcessCommands
-- Public API delegates to core (kept on DSTP so modmain/the rest call DSTP.X)
DSTP.PushEvent = Core.PushEvent
DSTP.RegisterCommand = Core.RegisterCommand

-- SendPrivateMessage moved to core (shared by commands + the panel-link helper).
local SendPrivateMessage = Core.SendPrivateMessage

-- Forward declarations (DST strict mode requires variables to exist before reference)
local SendUrlToAdmin
local SendUrlToAdmins
local MaybeNotifyOwnerSetup
local HookChat
local HotToggleEvents
-- (RegisterPerPlayerEvents/RegisterGameEvents now come from dstp/events, aliased below)

-- Logging + JSON helpers moved to dstp/core (aliased above: Log/LogError/LogInfo/
-- SafeEncode/SafeDecode). DSTP._DEBUG kept as a public alias of Core.DEBUG, synced
-- in DSTP.Init, since `if DSTP._DEBUG then` guards are used throughout.
DSTP._DEBUG = false

-- Data collectors moved to dstp/collectors (pure serializers of server/player
-- state). Aliased here for the poll loop. Collectors.Init(core) called in DSTP.Init.
local Collectors = require("dstp/collectors")
local GetServerInfo = Collectors.GetServerInfo
local GetAllPlayersData = Collectors.GetAllPlayersData
local RefreshClientTable = Collectors.RefreshClientTable


-- SafeDump / DSTP.PushEvent / the command system (RegisterCommand/Execute/Process)
-- / FindPlayer all moved to dstp/core and are aliased at the top of this file.

-- The ~55 command handlers moved to dstp/commands (bodies unchanged). Registered
-- via Commands.RegisterAll(Core) in DSTP.Init.
local Commands = require("dstp/commands")

-------------------------------------------------
-- Polling (adaptive)
-------------------------------------------------
-- Adaptive polling: rate depends on what the server is doing.
-- Empty server idles at 30s, active server syncs at 5s, burst mode (events
-- queued or commands arriving) drops to 0.5s briefly.
-- `state.next_poll_delay` is read by ScheduleNextPoll after each cycle.
state.next_poll_delay = nil
state.last_cmd_count = 0

local function ComputeNextDelay()
    -- Events in queue → flush ASAP. With the relay buffering pushed commands
    -- locally (WS), the round-trip cost of a fast poll is tiny, so we poll
    -- aggressively to make reactions (e.g. heal-on-hit) near-instant.
    if #state.event_queue > 0 then return 0.1 end

    -- Burst mode: backend sent commands recently → stay responsive
    if state.last_cmd_count > 0 then return 0.5 end

    -- Idle: no players connected → slow way down
    local client_count = 0
    for _, c in pairs(_G.TheNet and _G.TheNet:GetClientTable() or {}) do
        if c.userid and c.userid ~= "" then client_count = client_count + 1 end
    end
    if client_count == 0 then return 30 end

    -- Active server: use configured poll_interval as baseline
    return config.poll_interval
end

local function DoPoll()
    if not _G.TheWorld or not _G.TheWorld.ismastersim then return end

    RefreshClientTable()

    local events = {}
    for i = 1, math.min(#state.event_queue, config.max_batch_size) do
        table.insert(events, table.remove(state.event_queue, 1))
    end

    local payload = {
        server_id = config.server_id,
        shard_id = config.shard_id,
        shard_type = config.shard_type,
        server = GetServerInfo(),
        players = GetAllPlayersData(),
        events = events,
        active_events = evt_config,
        debounce = event_debounce,
    }

    local json_data = SafeEncode(payload)
    if not json_data then return end

    _G.TheSim:QueryServer(
        config.backend_url .. "/api/dst/sync",
        function(result, isSuccessful, resultCode)
            if isSuccessful and result then
                local data = SafeDecode(result)
                if data then
                    state.connected = true
                    state.connection_errors = 0
                    state.last_successful_poll = _G.GetTime()
                    if data.commands and #data.commands > 0 then
                        state.last_cmd_count = #data.commands
                        ProcessCommands(data.commands)
                    else
                        state.last_cmd_count = 0
                    end
                    -- Hot-toggle event categories from backend
                    if data.enable_events then
                        HotToggleEvents(data.enable_events)
                    end
                    -- Update debounce times from backend
                    if data.debounce then
                        for k, v in pairs(data.debounce) do
                            if type(v) == "number" then
                                event_debounce[k] = v
                            end
                        end
                    end
                end
            else
                state.connection_errors = state.connection_errors + 1
                state.connected = false
                if state.connection_errors % 10 == 1 then
                    LogError("Connection failed (attempt " .. state.connection_errors .. "): " .. tostring(resultCode))
                end
            end
        end,
        "POST",
        json_data
    )
end

-- Game event listeners moved to dstp/events (per-player/world/weather/boss/grief).
-- Bodies unchanged; gated by core.evt_config. Wired via Events.RegisterGameEvents in
-- the world postinit, and Events.RegisterPerPlayerEvents for connecting players.
local Events = require("dstp/events")
local RegisterGameEvents = Events.RegisterGameEvents
local RegisterPerPlayerEvents = Events.RegisterPerPlayerEvents

-- Send private message to a specific player via net_string
-- SendPrivateMessage now lives in dstp/core (aliased at the top of this file).

-- Issue a one-shot magic link from the backend and call cb(url) with the final
-- URL. `panel_base` is the resolved panel address (e.g. http://localhost:3000)
-- already containing "/?server=...". Falls back to the plain base if the token
-- request fails.
local function IssueLinkAndBuild(panel_base, cb)
    local link_url = config.backend_url .. "/api/panel-auth/issue-link/" .. config.server_id
    if DSTP._DEBUG then Log("IssueLink: GET " .. link_url) end
    _G.TheSim:QueryServer(link_url, function(result, is_ok, http_code)
        local final_url = panel_base
        if is_ok and http_code == 200 and result then
            local ok, parsed = _G.pcall(_G.json.decode, result)
            if ok and parsed and parsed.token then
                final_url = panel_base .. "&access=" .. tostring(parsed.token)
            end
        end
        cb(final_url)
    end, "GET")
end

-- Fetch a one-shot magic link from the backend and call cb(url) with the final URL.
-- Re-resolves the panel address from the relay (/relay-status -> upstream) at click
-- time instead of trusting the value cached at boot. Without this, a #panel issued
-- before the boot-time relay-status reply lands uses the provisional URL, which falls
-- back to the prod domain (https://dstp.marcosbrendon.com) even on a dev/local relay.
-- The two QueryServer calls are CHAINED (relay-status, then issue-link) so they never
-- run concurrently — DST has very few concurrent QueryServer slots.
local function FetchPanelUrlWithToken(cb)
    local status_url = config.backend_url .. "/relay-status"
    _G.TheSim:QueryServer(status_url, function(result, is_ok, http_code)
        local panel_base = config.panel_url  -- fallback: whatever we resolved at boot
        if is_ok and http_code == 200 and result then
            local ok, parsed = _G.pcall(_G.json.decode, result)
            if ok and parsed and type(parsed.upstream) == "string" and parsed.upstream ~= "" then
                panel_base = parsed.upstream .. "/?server=" .. config.server_id
                -- Refresh the cache too, so other paths benefit.
                config.panel_url_base = parsed.upstream
                config.panel_url = panel_base
                if DSTP._DEBUG then Log("FetchPanelUrl: upstream resolved -> " .. tostring(panel_base)) end
            end
        end
        IssueLinkAndBuild(panel_base, cb)
    end, "GET")
end

-- Send panel URL to a specific player (if admin)
SendUrlToAdmin = function(player)
    if not player or not player:IsValid() then return end
    local client_table = _G.TheNet:GetClientTable() or {}
    for _, client in pairs(client_table) do
        if client.userid == player.userid and client.admin then
            FetchPanelUrlWithToken(function(url)
                if player:IsValid() then
                    SendPrivateMessage(player, "Panel: " .. url)
                end
            end)
            return
        end
    end
end

SendUrlToAdmins = function()
    local client_table = _G.TheNet:GetClientTable() or {}
    for _, client in pairs(client_table) do
        if client.admin and client.userid then
            for _, player in ipairs(_G.AllPlayers) do
                if player.userid == client.userid then
                    local captured = player
                    FetchPanelUrlWithToken(function(url)
                        if captured:IsValid() then
                            SendPrivateMessage(captured, "Panel: " .. url)
                        end
                    end)
                end
            end
        end
    end
end

-- First-run nudge: when an admin spawns and the server has no panel password
-- yet, send them the setup link automatically (once per server boot) so the
-- owner doesn't have to know about #panel. Checks /status via the relay; only
-- fires when setup == false (no password). Once configured, this goes quiet.
local owner_notified = false
MaybeNotifyOwnerSetup = function(player)
    if owner_notified or not player or not player:IsValid() then return end
    -- Only for admins.
    local is_admin = false
    for _, client in pairs(_G.TheNet:GetClientTable() or {}) do
        if client.userid == player.userid and client.admin then is_admin = true; break end
    end
    if not is_admin then return end

    local status_url = config.backend_url .. "/api/panel-auth/status/" .. config.server_id
    _G.TheSim:QueryServer(status_url, function(result, is_ok, http_code)
        if not (is_ok and http_code == 200 and result) then return end
        local ok, parsed = _G.pcall(_G.json.decode, result)
        if not (ok and parsed) then return end
        owner_notified = true
        -- setup == false means no password set yet → first run. Tell the admin
        -- to run #panel to start configuring (don't push a link unprompted).
        if parsed.setup == false then
            local captured = player
            if captured:IsValid() then
                SendPrivateMessage(captured, "Painel DSTP ainda nao configurado. Digite #panel no chat para iniciar a configuracao do cluster.")
            end
        end
    end, "GET")
end

-- Hook chat via network message handler
-- Built-in chat commands (client-facing, intercepted before Networking_Say)
-- Return true to suppress the message (not broadcast to chat).
local function HandleBuiltinCommand(userid, name, message, player)
    if not message or type(message) ~= "string" then return false end
    -- Normalize: DST rewrites "/" to "#" on send. Accept both.
    local trimmed = message:match("^%s*(.-)%s*$") or message
    local cmd = trimmed:lower()

    if cmd == "#painel" or cmd == "/painel" or cmd == "#panel" or cmd == "/panel" then
        -- Only admins get the panel link
        local is_admin = false
        for _, client in pairs(_G.TheNet:GetClientTable() or {}) do
            if client.userid == userid and client.admin then
                is_admin = true
                break
            end
        end
        if is_admin and player and player:IsValid() then
            SendUrlToAdmin(player)
        end
        return true -- suppress
    end

    return false
end

HookChat = function()
    local OldNetworkSay = _G.Networking_Say
    if OldNetworkSay then
        _G.Networking_Say = function(guid, userid, name, prefab, message, colour, ...)
            -- Resolve the speaking player from userid
            local speaker = nil
            for _, p in ipairs(_G.AllPlayers or {}) do
                if p.userid == userid then speaker = p; break end
            end

            -- Intercept built-in commands before chat event is pushed
            if HandleBuiltinCommand(userid, name, message, speaker) then
                return -- suppress: do not broadcast, do not push event
            end

            -- A message that starts with the command prefix ("!") is a flow command:
            -- still emit chat_message (so flows react), but DON'T broadcast it to
            -- public chat (silent). Other players never see "!comprar lança".
            local is_command = type(message) == "string"
                and (message:match("^%s*(.-)%s*$") or message):sub(1, #COMMAND_PREFIX) == COMMAND_PREFIX

            DSTP.PushEvent("chat_message", {
                userid = userid,
                name = name,
                message = message,
                prefab = prefab,
                is_command = is_command,
            }, { guid = guid, userid = userid, name = name, prefab = prefab, message = message, colour = colour })

            if is_command then return end  -- suppress broadcast, event already pushed
            return OldNetworkSay(guid, userid, name, prefab, message, colour, ...)
        end
    end
end

-- Hot-toggle: just flip evt_config flags
-- All listeners are already registered and check evt_config at runtime
HotToggleEvents = function(requested)
    if not requested then return end
    local changed = false

    for category, enabled in pairs(requested) do
        if evt_config[category] ~= enabled then
            evt_config[category] = enabled
            changed = true
            if DSTP._DEBUG then Log("Event category '" .. category .. "' " .. (enabled and "ENABLED" or "DISABLED") .. " remotely") end
        end
    end

    if changed then
        local active = {}
        for k, v in pairs(evt_config) do
            if v then table.insert(active, k) end
        end
        if DSTP._DEBUG then Log("Active events: " .. table.concat(active, ", ")) end
    end
end

-------------------------------------------------
-- Init
-------------------------------------------------
function DSTP.Init(mod_env, mod_config)
    -- Inject the mod globals into the shared core FIRST, so core._G/json/config are
    -- populated before any helper (PushEvent/FindPlayer/...) runs. Then mirror them
    -- to this file's local aliases (same GLOBAL reference).
    Core.Init(mod_env.GLOBAL, mod_env.GLOBAL.json, nil)
    _G = Core._G
    json = Core.json

    config.is_auto_id = mod_config.is_auto_id or (mod_config.server_id == "auto")
    config.server_id = mod_config.server_id or "auto"
    if mod_config.backend_url then config.backend_url = mod_config.backend_url end
    if mod_config.panel_url_base and mod_config.panel_url_base ~= "" then
        config.panel_url_base = mod_config.panel_url_base
    else
        config.panel_url_base = config.backend_url
    end
    if mod_config.poll_interval then config.poll_interval = mod_config.poll_interval end
    if mod_config.debug_logs ~= nil then
        config.debug_logs = mod_config.debug_logs
        Core.DEBUG = mod_config.debug_logs
        DSTP._DEBUG = mod_config.debug_logs  -- public alias kept in sync with Core.DEBUG
    end

    -- Event categories config
    if mod_config.events then
        for k, v in pairs(mod_config.events) do
            evt_config[k] = v
        end
    end

    -- Land-claims store (terrain protection). The blocking overrides live in
    -- modmain; here we just init the singleton so the claim_* commands work.
    LandClaims = _G.require("dstp/land_claims").Init({
        GLOBAL = _G, debug_logs = config.debug_logs,
    })
    Core.LandClaims = LandClaims  -- share with core (commands will read it from there)

    Collectors.Init(Core)  -- inject core so collectors can read _G

    Commands.RegisterAll(Core)  -- register the ~55 command handlers

    -- Share the owner-setup notifier with core so the events module (player spawn)
    -- can call it without importing the chat helpers (avoids a circular require).
    Core.MaybeNotifyOwnerSetup = MaybeNotifyOwnerSetup

    Events.Init(Core)  -- inject core into the event listeners module

    mod_env.AddPrefabPostInit("world", function(inst)
        if not inst.ismastersim then return end

        -- Detect shard type
        config.shard_type = inst:HasTag("cave") and "caves" or "master"

        -- Attach the persistence component so claims save with the world.
        if not inst.components.dstp_landclaims then
            inst:AddComponent("dstp_landclaims")
        end

        -- Defer 1 frame so TheWorld.meta is fully populated
        inst:DoTaskInTime(0, function()
            -- Resolve server_id from world session_identifier if auto
            if config.is_auto_id then
                local session = _G.TheWorld.meta and _G.TheWorld.meta.session_identifier
                if session then
                    -- Use first 12 chars of session_identifier as unique ID
                    config.server_id = "dst-" .. session:sub(1, 12)
                else
                    LogInfo("WARNING: session_identifier not available, using fallback ID")
                    config.server_id = "dst-" .. tostring(_G.TheWorld.GUID)
                end
            end

            config.shard_id = config.server_id .. ":" .. config.shard_type

            -- Safety: force 1x speed on mod boot. If the previous session
            -- was paused (speed=0), keeping it paused would freeze our own
            -- polling loop (DoTaskInTime pauses with the sim), making the
            -- mod unrecoverable without a client connecting. Resetting
            -- here guarantees the mod always starts responsive.
            _G.pcall(function() _G.TheSim:SetTimeScale(1) end)

            LogInfo("=== DSTP Admin Panel ===")
            LogInfo("Server ID: " .. config.server_id)
            LogInfo("Shard: " .. config.shard_id .. " (" .. config.shard_type .. ")")
            LogInfo("Backend: " .. config.backend_url)
            LogInfo("Poll: " .. config.poll_interval .. "s")
            LogInfo("Debug logs: " .. (config.debug_logs and "ON" or "OFF"))

            -- Build panel URL (provisional; refined once the relay answers).
            config.panel_url = config.panel_url_base .. "/?server=" .. config.server_id
            LogInfo("============================================")
            LogInfo("  DSTP Panel: " .. config.panel_url)
            LogInfo("============================================")

            -- Ask the relay where it points (/relay-status -> upstream) and use
            -- that as the public panel address. The relay is the source of truth
            -- for the domain — nothing is hardcoded. If the relay is offline or
            -- doesn't answer, we keep the provisional URL above (which already
            -- falls back to backend_url/localhost), so this never breaks.
            _G.TheSim:QueryServer(config.backend_url .. "/relay-status", function(result, is_ok, http_code)
                if is_ok and http_code == 200 and result then
                    local ok, parsed = _G.pcall(_G.json.decode, result)
                    if ok and parsed and type(parsed.upstream) == "string" and parsed.upstream ~= "" then
                        config.panel_url_base = parsed.upstream
                        config.panel_url = parsed.upstream .. "/?server=" .. config.server_id
                        LogInfo("  DSTP Panel (via relay): " .. config.panel_url)
                    end
                end
            end, "GET")


            -- Panel URL is NOT auto-sent on boot or spawn anymore.
            -- Admins must use the `#panel` chat command to open the panel.

            RegisterGameEvents(inst)
            -- Only hook chat on master shard to avoid duplicates
            if config.shard_type == "master" then
                HookChat()
            end
            -- Self-scheduling adaptive poll: each cycle picks its own delay.
            local function ScheduleNextPoll()
                local delay = ComputeNextDelay()
                inst:DoTaskInTime(delay, function()
                    DoPoll()
                    ScheduleNextPoll()
                end)
            end
            inst:DoTaskInTime(2, function()
                DoPoll()
                ScheduleNextPoll()
            end)
        end) -- DoTaskInTime(0)
    end)

    return DSTP
end

DSTP.IsConnected = function() return state.connected end
DSTP.GetServerId = function() return config.server_id end
-- Issue a magic link and PM it to the given admin player. Uses the cached
-- panel_url (already resolved from the relay's upstream) + a one-shot token,
-- in a single QueryServer call. This is the canonical #panel path.
DSTP.SendUrlToAdmin = function(player) return SendUrlToAdmin(player) end

return DSTP
