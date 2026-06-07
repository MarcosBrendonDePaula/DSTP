-- DSTP Chat — the #panel command interception + panel-link delivery, the
-- Networking_Say hook (which suppresses "!" flow-commands from public chat and
-- fires chat_message), and the remote event-category hot-toggle. Extracted from
-- client.lua; bodies unchanged. Aliases come from core via Init(core). Exposes
-- SendUrlToAdmin / MaybeNotifyOwnerSetup / HookChat / HotToggleEvents.

local Chat = {}

-- Forward-decls: HandleBuiltinCommand -> SendUrlToAdmin; HookChat -> HandleBuiltinCommand.
local IssueLinkAndBuild
local FetchPanelUrlWithToken
local SendUrlToAdmin
local SendUrlToAdmins
local MaybeNotifyOwnerSetup
local HandleBuiltinCommand
local HookChat
local HotToggleEvents

-- core aliases (set in Init).
local core, _G, config, evt_config, COMMAND_PREFIX, SendPrivateMessage, Log
local DSTP

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

    -- Resolve admin once (shared by #panel and #selftest).
    local function IsAdmin()
        for _, client in pairs(_G.TheNet:GetClientTable() or {}) do
            if client.userid == userid and client.admin then return true end
        end
        return false
    end

    if cmd == "#painel" or cmd == "/painel" or cmd == "#panel" or cmd == "/panel" then
        -- Only admins get the panel link
        if IsAdmin() and player and player:IsValid() then
            SendUrlToAdmin(player)
        end
        return true -- suppress
    end

    -- #selftest — run the in-game self-test (admin ONLY). Results go to the server log
    -- (server_log.txt) AND a one-line PASS/FAIL summary is PM'd back to the admin so
    -- they don't need to open the log. Arbitrary engine-side assertions (coalescing,
    -- debounce, loop watchdog, execute gate) on the live master sim.
    if cmd == "#selftest" or cmd == "/selftest" then
        if not IsAdmin() then
            if player and player:IsValid() then
                SendPrivateMessage(player, "selftest: apenas admin.")
            end
            return true
        end
        if core.RunSelfTest then
            local ok, run = _G.pcall(core.RunSelfTest)
            if ok and run and player and player:IsValid() then
                local verdict = (run.failed == 0) and "TODOS OK" or (run.failed .. " FALHARAM")
                SendPrivateMessage(player, string.format("selftest: %d passou, %d falhou (%s) — ver server_log.txt", run.passed, run.failed, verdict))
            elseif player and player:IsValid() then
                SendPrivateMessage(player, "selftest: erro ao rodar (ver server_log.txt)")
            end
        elseif player and player:IsValid() then
            SendPrivateMessage(player, "selftest: indisponivel (core.RunSelfTest nao registrado)")
        end
        return true -- suppress
    end

    -- #uitest [clear] — VISUAL UI smoke test (admin ONLY): creates one of each widget
    -- on the admin's own HUD (label/panel/bar/button + clickable text/icon/image).
    -- Each click logs "UITEST CLICK" to server_log. `#uitest clear` removes them.
    if cmd == "#uitest" or cmd == "/uitest" or cmd == "#uitest clear" or cmd == "/uitest clear" then
        if not IsAdmin() then
            if player and player:IsValid() then SendPrivateMessage(player, "uitest: apenas admin.") end
            return true
        end
        local uid = userid
        local is_clear = cmd:find("clear", 1, true) ~= nil
        if is_clear then
            if core.ClearUITest then core.ClearUITest(uid) end
            if player and player:IsValid() then SendPrivateMessage(player, "uitest: widgets removidos.") end
        else
            if core.RunUITest then core.RunUITest(uid) end
            if player and player:IsValid() then
                SendPrivateMessage(player, "uitest: widgets criados — clique em button/text/icone/imagem; veja 'UITEST CLICK' no server_log. #uitest clear remove.")
            end
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

function Chat.Init(c)
    core = c
    _G = c._G
    config = c.config
    evt_config = c.evt_config
    COMMAND_PREFIX = c.COMMAND_PREFIX
    SendPrivateMessage = c.SendPrivateMessage
    Log = c.Log
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    -- Share with core so other modules call these without importing chat:
    --  events -> MaybeNotifyOwnerSetup (player spawn);  http -> HotToggleEvents (sync).
    core.MaybeNotifyOwnerSetup = MaybeNotifyOwnerSetup
    core.HotToggleEvents = HotToggleEvents
    return Chat
end

Chat.SendUrlToAdmin = function(player) return SendUrlToAdmin(player) end
Chat.HookChat = function() return HookChat() end
Chat.HotToggleEvents = function(requested) return HotToggleEvents(requested) end

return Chat
