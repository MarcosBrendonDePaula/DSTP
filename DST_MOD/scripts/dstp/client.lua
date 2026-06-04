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

-- SendPrivateMessage / SendUrlToAdmin / HookChat / HotToggleEvents / the panel
-- helpers now live in dstp/chat; RegisterPerPlayerEvents/RegisterGameEvents in
-- dstp/events; the poll loop in dstp/http. All wired in DSTP.Init below.

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

-- HTTP poll loop moved to dstp/http; chat/panel helpers + the Networking_Say hook
-- + event hot-toggle moved to dstp/chat. Both wired in DSTP.Init below.
local Http = require("dstp/http")
local Chat = require("dstp/chat")

-- Game event listeners moved to dstp/events (per-player/world/weather/boss/grief).
-- Bodies unchanged; gated by core.evt_config. Wired via Events.RegisterGameEvents in
-- the world postinit, and Events.RegisterPerPlayerEvents for connecting players.
local Events = require("dstp/events")
local RegisterGameEvents = Events.RegisterGameEvents
local RegisterPerPlayerEvents = Events.RegisterPerPlayerEvents
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

    -- Inject the core into every submodule. Order: collectors before http (http
    -- needs them); chat before/with events (chat populates core.MaybeNotifyOwnerSetup
    -- + core.HotToggleEvents, which events/http read).
    Collectors.Init(Core)
    Commands.RegisterAll(Core)        -- register the ~55 command handlers
    Chat.Init(Core)                   -- sets core.MaybeNotifyOwnerSetup + core.HotToggleEvents
    Events.Init(Core)                 -- event listeners (read core.evt_config + the chat hooks)
    Http.Init(Core, Collectors)       -- poll loop (needs the collectors)

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
                Chat.HookChat()
            end
            Http.Start(inst)  -- self-scheduling adaptive poll (DoPoll + ComputeNextDelay)
        end) -- DoTaskInTime(0)
    end)

    return DSTP
end

DSTP.IsConnected = function() return state.connected end
DSTP.GetServerId = function() return config.server_id end
-- Issue a magic link and PM it to the given admin player. Uses the cached
-- panel_url (already resolved from the relay's upstream) + a one-shot token,
-- in a single QueryServer call. This is the canonical #panel path.
DSTP.SendUrlToAdmin = function(player) return Chat.SendUrlToAdmin(player) end

return DSTP
