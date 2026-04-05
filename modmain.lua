local require = GLOBAL.require

local SERVER_ID = GetModConfigData("SERVER_ID") or ""
local BACKEND_URL = GetModConfigData("BACKEND_URL") or "http://127.0.0.1:3000"
local POLL_INTERVAL = GetModConfigData("POLL_INTERVAL") or 5

-- Generate ID from world session_identifier if auto
local is_auto_id = (SERVER_ID == "" or SERVER_ID == "auto")

-------------------------------------------------
-- Private Message System via net_string + net_event
-- Server sets the string, fires the event, client reads and shows in chat
-------------------------------------------------

-- Private Message System: net_string on player_classified
-- Server sets the string, client reads and shows in local chat
AddPrefabPostInit("player_classified", function(inst)
    inst._dstp_pm = GLOBAL.net_string(inst.GUID, "dstp.pm", "dstp_pm_dirty")

    -- Client-side only: listen for changes and show in chat / open URLs
    if not GLOBAL.TheWorld.ismastersim then
        inst:ListenForEvent("dstp_pm_dirty", function()
            local msg = inst._dstp_pm:value()
            if not msg or msg == "" then return end

            -- Check if message contains a URL to auto-open in Steam Overlay
            local url = msg:match("(https?://[%w%.%-_:/%?=&#]+)")
            if url then
                GLOBAL.VisitURL(url)
            end

            -- Also show in local chat
            if GLOBAL.ChatHistory then
                GLOBAL.ChatHistory:AddToHistory(
                    GLOBAL.ChatTypes.Message,
                    nil, nil, "[DSTP]", msg,
                    {0.4, 0.7, 1.0, 1.0},
                    "default", false, true, nil
                )
            end
        end)
    end
end)

-------------------------------------------------
-- Init DSTP client
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
    poll_interval = POLL_INTERVAL,
    events = {
        players = GetModConfigData("EVT_PLAYERS") ~= false,
        chat = GetModConfigData("EVT_CHAT") ~= false,
        world = GetModConfigData("EVT_WORLD") ~= false,
        combat = GetModConfigData("EVT_COMBAT") == true,
        crafting = GetModConfigData("EVT_CRAFTING") == true,
        inventory = GetModConfigData("EVT_INVENTORY") == true,
        weather = GetModConfigData("EVT_WEATHER") == true,
        bosses = GetModConfigData("EVT_BOSSES") == true,
        health = GetModConfigData("EVT_HEALTH") == true,
    },
})
