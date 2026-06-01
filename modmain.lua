local require = GLOBAL.require

local SERVER_ID = GetModConfigData("SERVER_ID") or ""
-- BACKEND_URL is fixed: DST sandbox only allows 127.0.0.1 for outbound HTTP.
-- Users run the DSTP relay (see relay/ directory), which listens on this port
-- and forwards to the actual public panel URL configured at build time.
-- Port 47834 is chosen from the unassigned IANA range to avoid conflicts
-- with common dev services (3000 is typical of Node, 8080 of Tomcat, etc).
local BACKEND_URL = "http://127.0.0.1:47834"
-- PANEL_URL is the public address of the web panel (baked into the mod).
-- Used only to build the link admins receive from #panel.
local PANEL_URL = "https://local.marcosbrendon.com"
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
    local server_id = dstp_mod.GetServerId() or ""
    -- BACKEND_URL: internal (LAN) URL used by QueryServer. Must be LAN/localhost — DST sandbox blocks public domains.
    -- PANEL_URL:   public URL the admin's browser will open. Can be any https domain.
    local base_url = PANEL_URL .. "/?server=" .. server_id

    -- Ask backend for a one-shot magic link (expires in 2 min, consumed on first open).
    local pc = player.player_classified
    local link_url = BACKEND_URL .. "/api/panel-auth/issue-link/" .. server_id
    GLOBAL.TheSim:QueryServer(link_url, function(result, is_ok, http_code)
        if not pc:IsValid() then return end
        local final_url = base_url
        if is_ok and http_code == 200 and result then
            local ok, parsed = GLOBAL.pcall(GLOBAL.json.decode, result)
            if ok and parsed and parsed.token then
                final_url = base_url .. "&access=" .. tostring(parsed.token)
            end
        end
        pc._dstp_pm:set("Panel: " .. final_url)
    end, "GET")
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
            if msg:sub(1, 7) == "Panel: " then
                local url = msg:match("(https?://[%w%.%-_:/%?=&#]+)")
                if url and (url:find(BACKEND_URL, 1, true) == 1 or url:find(PANEL_URL, 1, true) == 1) then
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
-- Admin Panel Access
-------------------------------------------------
-- Panel access is via chat command `#panel` (admins only).
-- See HandleBuiltinCommand in scripts/dstp/client.lua.
-- The old Tab scoreboard button was removed to keep panel opening explicit.
