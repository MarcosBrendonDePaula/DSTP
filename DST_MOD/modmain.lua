local require = GLOBAL.require

local SERVER_ID = GetModConfigData("SERVER_ID") or ""
-- BACKEND_URL is fixed: DST sandbox only allows 127.0.0.1 for outbound HTTP.
-- Users run the DSTP relay (see relay/ directory), which listens on this port
-- and forwards to the actual public panel URL configured at build time.
-- Port 47834 is chosen from the unassigned IANA range to avoid conflicts
-- with common dev services (3000 is typical of Node, 8080 of Tomcat, etc).
local BACKEND_URL = "http://127.0.0.1:47834"
-- PANEL_URL is the public address of the web panel. It is NOT meant to be
-- authoritative: the mod asks the relay (/relay-status -> upstream) for the
-- live address and caches it here. This baked value is only the fallback used
-- before the relay has answered (or if it's offline). Keeping it pointed at
-- the current default avoids a broken first link.
local PANEL_URL = "https://dstp.marcosbrendon.com"
local DEBUG_LOGS = GetModConfigData("DEBUG_LOGS") == true

local function DebugLog(...)
    if DEBUG_LOGS then print(...) end
end
local POLL_INTERVAL = GetModConfigData("POLL_INTERVAL") or 5

-- Client-side UI widget manager (loaded on client only)
local UIWidgets = nil
-- Client-side rules engine (loaded on client only)
local RulesEngine = nil

-- Generate ID from world session_identifier if auto
local is_auto_id = (SERVER_ID == "" or SERVER_ID == "auto")

-------------------------------------------------
-- Mod RPC: client → server panel URL request
-------------------------------------------------

-- UI Widget button callback: client → server → backend event queue
-- data_json (optional): JSON-encoded custom payload from client (rules emit_event etc.)
AddModRPCHandler(modname, "UICallback", function(player, callback_name, widget_id, data_json)
    if player and callback_name then
        -- Parse optional custom payload
        local data = nil
        if data_json and data_json ~= "" then
            local ok, parsed = GLOBAL.pcall(GLOBAL.json.decode, data_json)
            if ok then data = parsed end
        end
        local dstp_mod = require("dstp/client")
        dstp_mod.PushEvent("ui_callback", {
            userid = player.userid,
            name = player.name or "unknown",
            callback = callback_name,
            callback_name = callback_name,  -- alias for rules/schema consistency
            widget_id = widget_id or "",
            callback_data = data,
        })
    end
end)

AddModRPCHandler(modname, "RequestPanel", function(player)
    DebugLog("[DSTP] RPC RequestPanel received from:", player and player.name or "unknown")
    -- Server validates: is this player actually an admin?
    local is_admin = false
    for _, client in ipairs(GLOBAL.TheNet:GetClientTable() or {}) do
        if client.userid == player.userid then
            is_admin = client.admin
            break
        end
    end

    if not (is_admin and player.player_classified) then return end

    local dstp_mod = require("dstp/client")
    -- Delegate to the client module's canonical path: it already resolved the
    -- panel domain from the relay's upstream on boot (cached in config.panel_url,
    -- with a localhost fallback) and issues the one-shot token in a SINGLE
    -- QueryServer call. Doing two nested QueryServer calls here previously
    -- dropped the token (DST has limited concurrent QueryServer slots).
    dstp_mod.SendUrlToAdmin(player)
end)

-------------------------------------------------
-- Private Message System on player_classified
-------------------------------------------------

AddPrefabPostInit("player_classified", function(inst)
    -- PM system (server → client)
    inst._dstp_pm = GLOBAL.net_string(inst.GUID, "dstp.pm", "dstp_pm_dirty")

    -- UI Widget system (server → client per-player)
    inst._dstp_ui = GLOBAL.net_string(inst.GUID, "dstp.ui", "dstp_ui_dirty")

    -- Client: show PM in chat / auto-open URLs
    if not GLOBAL.TheWorld.ismastersim then
        inst:ListenForEvent("dstp_pm_dirty", function()
            local msg = inst._dstp_pm:value()
            if not msg or msg == "" then return end

            -- Panel links: open the URL silently, do NOT echo to chat.
            -- The link is built server-side from the backend's reported panel_url,
            -- so we trust it and open any http(s) URL — no host allowlist.
            if msg:sub(1, 7) == "Panel: " then
                local url = msg:match("(https?://[%w%.%-_:/%?=&#]+)")
                if url then
                    GLOBAL.VisitURL(url)
                end
                return
            end

            -- Other PMs (private_message action etc.): show in chat.
            if GLOBAL.ChatHistory then
                GLOBAL.ChatHistory:AddToHistory(
                    GLOBAL.ChatTypes.Message,
                    nil, nil, "[DSTP]", msg,
                    {0.4, 0.7, 1.0, 1.0},
                    "default", false, true, nil
                )
            end
        end)

        -- Client: process UI widget commands from backend
        inst:ListenForEvent("dstp_ui_dirty", function()
            local cmd_str = inst._dstp_ui:value()
            if not cmd_str or cmd_str == "" then return end

            -- Lazy-init widget manager on first use
            if not UIWidgets then
                UIWidgets = GLOBAL.require("dstp/ui_widgets")
                UIWidgets.Init({ GLOBAL = GLOBAL })

                -- Wire button callbacks: send RPC to server which queues an event
                -- AND dispatch into the local rules engine (if loaded) as a synthetic event
                UIWidgets.SetCallbackHandler(function(callback_name, widget_id)
                    if MOD_RPC and MOD_RPC[modname] and MOD_RPC[modname]["UICallback"] then
                        SendModRPCToServer(MOD_RPC[modname]["UICallback"], callback_name, widget_id, "")
                    end
                    if RulesEngine then
                        RulesEngine.OnUIButtonClick(callback_name, widget_id, nil)
                    end
                end)
            end

            local ok, cmd = GLOBAL.pcall(GLOBAL.json.decode, cmd_str)
            if not (ok and cmd and cmd.action) then return end

            -- Route rules_* / state_* to RulesEngine, others to UIWidgets
            local act = tostring(cmd.action)
            if act:sub(1, 6) == "rules_" or act:sub(1, 6) == "state_" then
                if not RulesEngine then
                    RulesEngine = GLOBAL.require("dstp/rules_engine")
                    RulesEngine.Init({ GLOBAL = GLOBAL, modname = modname })
                    RulesEngine.SetUIWidgets(UIWidgets)
                end
                RulesEngine.ProcessCommand(cmd)
            else
                UIWidgets.ProcessCommand(cmd)
            end
        end)
    end
end)

-------------------------------------------------
-- Init DSTP client (server-side)
-------------------------------------------------

local env = {
    GLOBAL = GLOBAL,
    AddPrefabPostInit = AddPrefabPostInit,
}

local dstp = require("dstp/client")
dstp.Init(env, {
    server_id = is_auto_id and "auto" or SERVER_ID,
    is_auto_id = is_auto_id,
    backend_url = BACKEND_URL,
    panel_url_base = PANEL_URL,
    poll_interval = POLL_INTERVAL,
    debug_logs = GetModConfigData("DEBUG_LOGS") == true,
    events = {
        players = GetModConfigData("EVT_PLAYERS") ~= false,
        chat = GetModConfigData("EVT_CHAT") ~= false,
        world = GetModConfigData("EVT_WORLD") ~= false,
        combat = GetModConfigData("EVT_COMBAT") == true,
        crafting = GetModConfigData("EVT_CRAFTING") == true,
        inventory = GetModConfigData("EVT_INVENTORY") == true,
        weather = GetModConfigData("EVT_WEATHER") == true,
        bosses = GetModConfigData("EVT_BOSSES") == true,
        gathering = GetModConfigData("EVT_GATHERING") == true,
        survival = GetModConfigData("EVT_SURVIVAL") == true,
        health = GetModConfigData("EVT_HEALTH") == true,
        character = GetModConfigData("EVT_CHARACTER") == true,
        exploration = GetModConfigData("EVT_EXPLORATION") == true,
        griefing = GetModConfigData("EVT_GRIEFING") == true,
    },
})

-------------------------------------------------
-- Dynamic data bindings — replicate server-only data to the client
-------------------------------------------------
-- DST doesn't replicate things like mob health to clients. A "binding" declares
-- a piece of data to mirror via our own netvar. A generic interpreter wires it
-- up identically on both sides, so adding a new datum is a config entry, not a
-- new hand-written netvar. See specs/dynamic-data-bindings.md.
--
-- HARD RULES (learned from a net-stream crash — see specs/dst-client-constraints):
--  * Gate by inst.prefab (deterministic both sides), NEVER by tag.
--  * Declare the netvar synchronously, identically, on server and client.
--  * Only the server's value push may be deferred.
local _BIND = {
    net = { ushortint = GLOBAL.net_ushortint, uint = GLOBAL.net_uint },
}

-- Whitelisted SOURCES. Each defines:
--  gate(inst): does this entity get this binding? MUST return the SAME answer on
--    server and client AT PostInit TIME. The ONLY thing guaranteed identical and
--    available that early is inst.prefab — so we gate by a curated prefab set.
--    (We tried inst.replica.<comp>: the replica is populated over the network
--    AFTER PostInit on the client, so server said yes / client said no → netvar
--    desync + "Failed to read net var data" crash. Tags have the same problem.
--    See specs/dst-client-constraints.md. Prefab gating is non-negotiable.)
--  read(inst): server-side reader → cur, max.
--  hook: component method to wrap so changes re-push.

-- Curated prefab set for the health binding (mobs/bosses worth a HP bar).
local HEALTH_PREFABS = {}
for _, p in ipairs({
    "spider","spider_warrior","spider_hider","spider_spitter","spider_dropper",
    "hound","firehound","icehound","houndmound","killerbee","bee","mosquito",
    "frog","tentacle","tentacle_pillar","merm","pigman","pigguard","bunnyman",
    "perd","rabbit","crow","robin","robin_winter","butterfly","beefalo",
    "babybeefalo","koalefant_summer","koalefant_winter","walrus","little_walrus",
    "rocky","slurtle","snurtle","buzzard","catcoon","lightninggoat","monkey",
    "tallbird","teenbird","smallbird","knight","bishop","rook","mole","batilisk",
    "bat","worm","lureplant","eyeplant","krampus","spat","penguin",
    "mandrake_active","deerclops","bearger","moose","dragonfly","antlion",
    "minotaur","leif","leif_sparse","spiderqueen","warg","klaus","toadstool",
    "stalker","stalker_forest","beequeen","crabking","malbatross",
    "crawlinghorror","terrorbeak","nightmarebeak","crawlingnightmare",
    "shadowtentacle","bishop_nightmare","rook_nightmare","knight_nightmare",
}) do HEALTH_PREFABS[p] = true end

local BIND_SOURCES = {
    health = {
        gate = function(inst) return HEALTH_PREFABS[inst.prefab] == true end,
        read = function(inst)
            local h = inst.components and inst.components.health
            if not h then return nil end
            return h.currenthealth, h.maxhealth
        end,
        hook = { comp = "health", method = "DoDelta" },
    },
    -- add more here (temperature, hunger, sanity…) with zero changes elsewhere
}

-- The active bindings. Mob-HP is the first binding.
-- Applied in a fixed id-sorted order so netvar declaration order matches.
local BINDINGS = {
    { id = "hp", source = "health", as = "dstp_hp", net = "ushortint" },
}

table.sort(BINDINGS, function(a, b) return a.id < b.id end)
local function clamp16(v) v = math.floor(v or 0); if v < 0 then v = 0 end; if v > 65535 then v = 65535 end; return v end

AddPrefabPostInitAny(function(inst)
    if inst.prefab == nil or inst:HasTag("player") then return end
    local isServer = (not GLOBAL.TheWorld) or GLOBAL.TheWorld.ismastersim

    for _, b in ipairs(BINDINGS) do
        local src = BIND_SOURCES[b.source]
        if src and src.gate(inst) then
            local ctor = _BIND.net[b.net] or GLOBAL.net_ushortint
            -- declare identically on both sides (cur + max)
            inst["_b_" .. b.as] = ctor(inst.GUID, b.as, b.as .. "_dirty")
            inst["_b_" .. b.as .. "_max"] = ctor(inst.GUID, b.as .. "_max", b.as .. "_max_dirty")

            if isServer then
                local nv, nvmax = inst["_b_" .. b.as], inst["_b_" .. b.as .. "_max"]
                local function push()
                    local cur, max = src.read(inst)
                    if cur == nil then return end
                    nv:set(clamp16(cur)); nvmax:set(clamp16(max))
                end
                inst:DoTaskInTime(0, function()
                    local comp = inst.components and inst.components[src.hook.comp]
                    if not comp then return end
                    local m = src.hook.method
                    local orig = comp[m]
                    comp[m] = function(self, ...) local r = orig(self, ...); push(); return r end
                    push()
                end)
            else
                -- client: cache values on the entity under <as>/<as>_max
                local as, asmax = b.as, b.as .. "_max"
                inst:ListenForEvent(as .. "_dirty", function() inst[as] = inst["_b_" .. as]:value() end)
                inst:ListenForEvent(asmax .. "_dirty", function() inst[asmax] = inst["_b_" .. asmax]:value() end)
            end
        end
    end
end)

-------------------------------------------------
-- Admin Panel Access
-------------------------------------------------
-- Panel access is via chat command `#panel` (admins only).
-- See HandleBuiltinCommand in scripts/dstp/client.lua.
-- The old Tab scoreboard button was removed to keep panel opening explicit.
