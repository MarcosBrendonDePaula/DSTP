-- DSTP Keys — CLIENT-side key capture for the key_pressed trigger. Runs in the game
-- client (NOT the master sim). The backend computes which keys any flow watches and
-- ships the list to the client via the dstp.keys net_string (same idea as the
-- enable_events channel for categories). We register ONE global TheInput key handler
-- and only fire an RPC to the server for keys in the watch set, on the DOWN edge
-- (auto-repeat deduped), and never while the player is typing in chat/console.
--
-- Init({ GLOBAL, SendRPC }) — SendRPC(keyName, down) is injected by modmain (it owns
-- the MOD_RPC/SendModRPCToServer references). SetWatchKeys(list) rebuilds the filter.

local M = {}

local _G
local SendRPC                 -- injected: function(keyName, down)
local _name_to_code = {}      -- "H" -> KEY_H code
local _code_to_name = {}      -- KEY_H code -> "H"
local _watch = {}             -- [code] = true  (the active watch set; empty = nothing)
local _held = {}              -- [code] = true  (down-edge dedupe vs auto-repeat)
local _installed = false

-- Build the name<->code maps from the real DST KEY_* globals, so we only ever speak
-- names we can actually resolve. Guard each (constant availability varies by build).
local function BuildKeyMaps()
    local function add(name, const)
        -- DST runs in STRICT MODE: a bare `_G[const]` for a KEY_* constant that
        -- doesn't exist on this build raises "variable 'KEY_x' is not declared"
        -- (the strict metatable intercepts __index). rawget bypasses the metatable
        -- and returns nil for a missing constant instead of crashing.
        local code = rawget(_G, const)
        if code ~= nil then
            _name_to_code[name] = code
            _code_to_name[code] = name
        end
    end
    -- Letters A-Z -> KEY_A..KEY_Z (DST constants are UPPERCASE: KEY_A, KEY_H, ...)
    for i = 0, 25 do
        local ch = string.char(65 + i)         -- 'A'..'Z'
        add(ch, "KEY_" .. ch)                  -- KEY_A..KEY_Z
    end
    -- Digits 0-9 -> KEY_0..KEY_9
    for i = 0, 9 do add(tostring(i), "KEY_" .. tostring(i)) end
    -- Function keys F1-F12
    for i = 1, 12 do add("F" .. i, "KEY_F" .. i) end
    -- A few named keys
    add("SPACE", "KEY_SPACE")
    add("TAB", "KEY_TAB")
    add("ENTER", "KEY_ENTER")
    add("ESCAPE", "KEY_ESCAPE")
    add("UP", "KEY_UP")
    add("DOWN", "KEY_DOWN")
    add("LEFT", "KEY_LEFT")
    add("RIGHT", "KEY_RIGHT")
end

-- True when the player is typing (chat/console open) — don't let 'H' typed in chat
-- fire a flow. Guards are best-effort across DST builds.
-- IMPORTANT: DST strict mode makes a bare `_G.Name` for an UNDECLARED global THROW
-- ("variable 'X' is not declared"), not return nil — so every optional global must
-- be probed with rawget(_G, "Name") to read it safely.
local function IsTyping()
    local IsConsoleScreenOpen = rawget(_G, "IsConsoleScreenOpen")
    if IsConsoleScreenOpen and IsConsoleScreenOpen() then return true end
    -- Chat input box focused: the TheFrontEnd focus widget is a text editor.
    local TheFrontEnd = rawget(_G, "TheFrontEnd")
    if TheFrontEnd then
        local w = TheFrontEnd.GetFocusWidget and TheFrontEnd:GetFocusWidget()
        if w and w.editing then return true end          -- TextEdit sets .editing while focused
        if TheFrontEnd.textProcessorWidget then return true end
    end
    return false
end

-- DST's input layer calls handlers added via AddKeyHandler as fn(key, down) where
-- `down` comes from OnRawKey(key, is_up) → it is actually IS_UP (true on release).
-- So the real key-down edge is `not is_up`. (Confirmed in vanilla input.lua:186/765.)
local function OnRawKey(code, is_up)
    local down = not is_up
    if not _watch[code] then return end           -- fast path: not watched → ignore
    if down then
        if _held[code] then return end             -- auto-repeat while held → swallow
        _held[code] = true
        if IsTyping() then return end              -- typing in chat → don't fire (keep held)
        local name = _code_to_name[code]
        -- Capture the mouse's WORLD position at press time, so a flow can e.g. tp the
        -- player to where the cursor points ({{trigger.world_x}}/{{trigger.world_z}}).
        -- GetWorldPosition projects the screen cursor onto the ground; it returns nil
        -- when the cursor isn't over terrain (sky/UI) — then we send no position.
        local wx, wz
        local TheInput = rawget(_G, "TheInput")
        if TheInput and TheInput.GetWorldPosition then
            local ok, pos = _G.pcall(function() return TheInput:GetWorldPosition() end)
            if ok and pos then wx, wz = pos.x, pos.z end
        end
        if name and SendRPC then SendRPC(name, true, wx, wz) end
    else
        _held[code] = nil                          -- released → allow next down to fire
        -- down-only for now; held-state bookkeeping makes future key-up trivial.
    end
end

function M.Init(opts)
    _G = opts.GLOBAL
    SendRPC = opts.SendRPC
    BuildKeyMaps()
    if not _installed and _G.TheInput and _G.TheInput.AddKeyHandler then
        _G.TheInput:AddKeyHandler(OnRawKey)
        _installed = true
    end
    return M
end

-- Rebuild the active watch set from a list of key-name strings (uppercase). Unknown
-- names (no KEY_* mapping) are skipped. Clears held-state for keys no longer watched.
function M.SetWatchKeys(list)
    _watch = {}
    if type(list) == "table" then
        for _, name in ipairs(list) do
            local code = _name_to_code[string.upper(tostring(name))]
            if code ~= nil then _watch[code] = true end
        end
    end
    -- Drop stale held flags so a release we now ignore can't wedge a future press.
    for code in pairs(_held) do
        if not _watch[code] then _held[code] = nil end
    end
end

return M
