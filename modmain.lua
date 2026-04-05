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

-- Add net vars to player_classified for private messaging
AddPrefabPostInit("player_classified", function(inst)
    inst._dstp_pm = GLOBAL.net_string(inst.GUID, "dstp.pm", "dstp_pm_dirty")
end)

-- Client-side: listen for private message event and show in chat
AddPrefabPostInit("player_classified", function(inst)
    if not GLOBAL.TheWorld.ismastersim then
        inst:ListenForEvent("dstp_pm_dirty", function()
            local msg = inst._dstp_pm:value()
            if msg and msg ~= "" and GLOBAL.ChatHistory then
                GLOBAL.ChatHistory:AddToHistory(
                    GLOBAL.ChatTypes.Message,  -- type
                    nil,                       -- sender_userid
                    nil,                       -- sender_netid
                    "[DSTP]",                  -- sender_name
                    msg,                       -- message
                    {0.4, 0.7, 1.0, 1.0},     -- colour (blue-ish)
                    "default",                 -- icondata
                    false,                     -- whisper
                    true,                      -- localonly (only this client sees it!)
                    nil                        -- text_filter_context
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
