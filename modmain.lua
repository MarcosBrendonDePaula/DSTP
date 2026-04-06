local require = GLOBAL.require

local SERVER_ID = GetModConfigData("SERVER_ID") or ""
local BACKEND_URL = GetModConfigData("BACKEND_URL") or "http://127.0.0.1:3000"
local POLL_INTERVAL = GetModConfigData("POLL_INTERVAL") or 5

-- Generate ID from world session_identifier if auto
local is_auto_id = (SERVER_ID == "" or SERVER_ID == "auto")

-------------------------------------------------
-- Mod RPC: client → server panel URL request
-------------------------------------------------

AddModRPCHandler(modname, "RequestPanel", function(player)
    print("[DSTP] RPC RequestPanel received from:", player and player.name or "unknown")
    -- Server validates: is this player actually an admin?
    local is_admin = false
    for _, client in ipairs(GLOBAL.TheNet:GetClientTable() or {}) do
        if client.userid == player.userid then
            is_admin = client.admin
            break
        end
    end

    if is_admin and player.player_classified then
        local dstp_mod = require("dstp/client")
        local server_id = dstp_mod.GetServerId() or ""
        local panel_url = "Panel: " .. BACKEND_URL .. "/?server=" .. server_id
        player.player_classified._dstp_pm:set(panel_url)
    end
end)

-------------------------------------------------
-- Private Message System on player_classified
-------------------------------------------------

AddPrefabPostInit("player_classified", function(inst)
    -- PM system (server → client)
    inst._dstp_pm = GLOBAL.net_string(inst.GUID, "dstp.pm", "dstp_pm_dirty")

    -- Client: show PM in chat / auto-open URLs
    if not GLOBAL.TheWorld.ismastersim then
        inst:ListenForEvent("dstp_pm_dirty", function()
            local msg = inst._dstp_pm:value()
            if not msg or msg == "" then return end

            local url = msg:match("(https?://[%w%.%-_:/%?=&#]+)")
            if url and url:find(BACKEND_URL, 1, true) == 1 then
                GLOBAL.VisitURL(url)
            end

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
        gathering = GetModConfigData("EVT_GATHERING") == true,
        survival = GetModConfigData("EVT_SURVIVAL") == true,
        health = GetModConfigData("EVT_HEALTH") == true,
    },
})

-------------------------------------------------
-- Admin Panel Button in Tab Scoreboard
-------------------------------------------------

local ImageButton = require("widgets/imagebutton")
local PlayerStatusScreen = require("screens/playerstatusscreen")

-- Client-side: send RPC to server asking for the panel URL
local function RequestPanelUrl()
    print("[DSTP] RequestPanelUrl called, MOD_RPC:", MOD_RPC, "modname:", modname)
    if MOD_RPC and MOD_RPC[modname] and MOD_RPC[modname]["RequestPanel"] then
        print("[DSTP] Sending RPC...")
        SendModRPCToServer(MOD_RPC[modname]["RequestPanel"])
    else
        print("[DSTP] MOD_RPC not available, trying GLOBAL")
        SendModRPCToServer(GLOBAL.MOD_RPC[modname]["RequestPanel"])
    end
end

local OldDoInit = PlayerStatusScreen.DoInit
function PlayerStatusScreen:DoInit(ClientObjs, ...)
    OldDoInit(self, ClientObjs, ...)

    -- Only for admins (client-side check for UI only, server validates the real access)
    if not GLOBAL.TheNet:GetIsServerAdmin() then return end

    -- Guard: only wrap updatefn once (same pattern as Global Positions)
    if not self.scroll_list._dstp_old_updatefn then
        -- Add DSTP button to each static row widget
        for _, playerListing in pairs(self.scroll_list.static_widgets) do
            playerListing.dstp_btn = playerListing:AddChild(
                ImageButton(
                    "images/button_icons.xml", "configure_mod.tex",
                    "configure_mod.tex", "configure_mod.tex", "configure_mod.tex",
                    nil, {1, 1}, {0, 0}
                )
            )
            playerListing.dstp_btn.scale_on_focus = false
            playerListing.dstp_btn:SetHoverText(
                "DSTP Admin Panel",
                {font = GLOBAL.NEWFONT_OUTLINE, size = 24, offset_x = 0, offset_y = 30, colour = {1, 1, 1, 1}}
            )

            -- Hover feedback matching Global Positions style
            local gainfocusfn = playerListing.dstp_btn.OnGainFocus
            playerListing.dstp_btn.OnGainFocus = function()
                gainfocusfn(playerListing.dstp_btn)
                GLOBAL.TheFrontEnd:GetSound():PlaySound("dontstarve/HUD/click_mouseover")
                playerListing.dstp_btn.image:SetScale(1.1)
            end
            local losefocusfn = playerListing.dstp_btn.OnLoseFocus
            playerListing.dstp_btn.OnLoseFocus = function()
                losefocusfn(playerListing.dstp_btn)
                playerListing.dstp_btn.image:SetScale(1)
            end

            playerListing.dstp_btn:SetOnClick(function()
                RequestPanelUrl()
            end)
            playerListing.dstp_btn:Hide()
        end

        -- Wrap updatefn to show button only on the admin's own row
        self.scroll_list._dstp_old_updatefn = self.scroll_list.updatefn
        self.scroll_list.updatefn = function(playerListing, client, ...)
            self.scroll_list._dstp_old_updatefn(playerListing, client, ...)

            if playerListing.dstp_btn then
                if client and self.owner and client.userid == self.owner.userid then
                    -- Position after viewprofile button (same x=92 as Global Positions)
                    playerListing.dstp_btn:SetPosition(92, 3, 0)
                    -- Wire focus navigation so the button is reachable
                    playerListing.viewprofile:SetFocusChangeDir(GLOBAL.MOVE_RIGHT, playerListing.dstp_btn)
                    playerListing.dstp_btn:SetFocusChangeDir(GLOBAL.MOVE_LEFT, playerListing.viewprofile)
                    playerListing.dstp_btn:Show()
                else
                    playerListing.dstp_btn:Hide()
                end
            end
        end
    end
end
