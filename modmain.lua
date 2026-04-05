local require = GLOBAL.require

local SERVER_ID = GetModConfigData("SERVER_ID") or ""
local BACKEND_URL = GetModConfigData("BACKEND_URL") or "http://127.0.0.1:3000"
local POLL_INTERVAL = GetModConfigData("POLL_INTERVAL") or 5

-- Generate ID from world session_identifier if auto
local is_auto_id = (SERVER_ID == "" or SERVER_ID == "auto")
-- Actual ID resolution happens in client.lua Init after world is loaded
-- We pass the flag so client.lua can use TheWorld.meta.session_identifier

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
