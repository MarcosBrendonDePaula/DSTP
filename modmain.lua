local require = GLOBAL.require

local SERVER_ID = GetModConfigData("SERVER_ID") or ""
local BACKEND_URL = GetModConfigData("BACKEND_URL") or "http://127.0.0.1:3000"
local POLL_INTERVAL = GetModConfigData("POLL_INTERVAL") or 5

-- Generate random ID if not set
local is_auto_id = (SERVER_ID == "" or SERVER_ID == "auto")
if is_auto_id then
    local chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    SERVER_ID = "dstp-"
    for i = 1, 6 do
        local idx = math.random(1, #chars)
        SERVER_ID = SERVER_ID .. chars:sub(idx, idx)
    end
end

local env = {
    GLOBAL = GLOBAL,
    AddPrefabPostInit = AddPrefabPostInit,
}

local dstp = require("dstp/client")
dstp.Init(env, {
    server_id = SERVER_ID,
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
