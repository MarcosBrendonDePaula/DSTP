-- DSTP Keys — CLIENT-side key capture for the key_pressed AND key_combo triggers.
-- Runs in the game client (NOT the master sim). The backend computes which keys/combos
-- any flow watches and ships them on the dstp.keys net_string. We register ONE global
-- TheInput key handler and fire an RPC on the DOWN edge for: a watched single key
-- (key_pressed), and any matched combo (key_combo, 3 modes). Auto-repeat is deduped
-- and nothing fires while the player is typing in chat/console.
--
-- Init({ GLOBAL, SendRPC, SendComboRPC }) — the senders are injected by modmain (it
-- owns MOD_RPC/SendModRPCToServer). SetWatch(payload) rebuilds keys + combos; payload
-- is either a legacy array of key names, or { keys = [...], combos = [...] }.

local M = {}

local _G
local SendRPC                 -- injected: function(keyName, down, wx, wz)
local SendComboRPC            -- injected: function(combo_id, key, wx, wz)
local _name_to_code = {}      -- "H" -> KEY_H code
local _code_to_name = {}      -- KEY_H code -> "H"
local _mod_code = {}          -- "CTRL"/"SHIFT"/"ALT" -> KEY_CTRL/.. code (generic L+R)
local _watch = {}             -- [code] = true  (every individual key to capture)
local _simple = {}            -- [code] = true  (keys from a real key_pressed trigger)
local _held = {}              -- [code] = true  (down-edge dedupe vs auto-repeat)
local _installed = false

-- Combo indices (rebuilt by SetWatch):
local _simul_by_code = {}     -- [code] = { {id, modifiers={...}}, ... }
local _any_by_code = {}       -- [code] = { id, ... }
local _seq = {}               -- list of { id, codes={...}, timeout, pos, start }

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
    -- Modifier keys for the simultaneous combo mode. Generic (L+R) codes — the game
    -- itself uses KEY_CTRL/SHIFT/ALT with IsKeyDown to mean "either side".
    _mod_code.CTRL  = rawget(_G, "KEY_CTRL")
    _mod_code.SHIFT = rawget(_G, "KEY_SHIFT")
    _mod_code.ALT   = rawget(_G, "KEY_ALT")
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

-- All listed modifiers currently held? (generic CTRL/SHIFT/ALT via IsKeyDown).
local function AllModsDown(mods)
    local TheInput = rawget(_G, "TheInput")
    if not (TheInput and TheInput.IsKeyDown) then return false end
    for _, m in ipairs(mods or {}) do
        local mc = _mod_code[m]
        if not (mc and TheInput:IsKeyDown(mc)) then return false end
    end
    return true
end

-- Any relevant modifier held? Used to suppress a bare key_pressed when a combo on the
-- same key is configured (so Ctrl+H fires the combo, not the plain H flow too).
local function AnyModDown()
    local TheInput = rawget(_G, "TheInput")
    if not (TheInput and TheInput.IsKeyDown) then return false end
    for _, m in ipairs({ "CTRL", "SHIFT", "ALT" }) do
        local mc = _mod_code[m]
        if mc and TheInput:IsKeyDown(mc) then return true end
    end
    return false
end

-- Advance each registered sequence by the just-pressed code; fire on completion.
-- Timeout is measured from the FIRST step ("H J K within timeoutMs").
local function MatchSequences(code, now, wx, wz)
    for _, s in ipairs(_seq) do
        if s.pos > 0 and (now - s.start) > s.timeout then
            s.pos = 0   -- window expired → reset before evaluating this key
        end
        local expected = s.codes[s.pos + 1]
        if code == expected then
            if s.pos == 0 then s.start = now end
            s.pos = s.pos + 1
            if s.pos >= #s.codes then
                if SendComboRPC then SendComboRPC(s.id, _code_to_name[code], wx, wz) end
                s.pos = 0
            end
        else
            -- wrong key: reset, but allow it to start a new attempt if it's step 1
            if code == s.codes[1] then s.pos = 1; s.start = now else s.pos = 0 end
        end
    end
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
        local now = _G.GetTime and _G.GetTime() or 0

        -- 1) key_pressed (only for keys from a real key_pressed trigger). If a
        -- simultaneous combo shares this key and a modifier is held, suppress the
        -- plain key_pressed so Ctrl+H doesn't ALSO fire the bare-H flow.
        if _simple[code] and name and SendRPC then
            if not (_simul_by_code[code] and AnyModDown()) then
                SendRPC(name, true, wx, wz)
            end
        end

        -- 2) simultaneous combos on this key
        if _simul_by_code[code] then
            for _, combo in ipairs(_simul_by_code[code]) do
                if AllModsDown(combo.modifiers) and SendComboRPC then
                    SendComboRPC(combo.id, name, wx, wz)
                end
            end
        end

        -- 3) sequence combos
        if #_seq > 0 then MatchSequences(code, now, wx, wz) end

        -- 4) any-of-set combos on this key
        if _any_by_code[code] then
            for _, id in ipairs(_any_by_code[code]) do
                if SendComboRPC then SendComboRPC(id, name, wx, wz) end
            end
        end
    else
        _held[code] = nil                          -- released → allow next down to fire
    end
end

function M.Init(opts)
    _G = opts.GLOBAL
    SendRPC = opts.SendRPC
    SendComboRPC = opts.SendComboRPC
    BuildKeyMaps()
    if not _installed and _G.TheInput and _G.TheInput.AddKeyHandler then
        _G.TheInput:AddKeyHandler(OnRawKey)
        _installed = true
    end
    return M
end

local function codeOf(name)
    return _name_to_code[string.upper(tostring(name))]
end

-- Rebuild keys + combos from the backend payload. Accepts either a legacy ARRAY of
-- key names (key_pressed only) or an OBJECT { keys = [...], combos = [...] }.
function M.SetWatch(payload)
    _watch, _simple, _simul_by_code, _any_by_code, _seq = {}, {}, {}, {}, {}

    local keys, combos
    if type(payload) == "table" then
        if payload.keys ~= nil or payload.combos ~= nil then
            keys, combos = payload.keys, payload.combos          -- new envelope
        else
            keys = payload                                       -- legacy array
        end
    end

    -- Individual keys (all of these enter _watch; the ones from key_pressed also _simple).
    if type(keys) == "table" then
        for _, name in ipairs(keys) do
            local code = codeOf(name)
            if code ~= nil then _watch[code] = true; _simple[code] = true end
        end
    end

    -- Combos. Their keys must ALSO be in _watch (so OnRawKey doesn't ignore them), but
    -- are NOT _simple unless a key_pressed trigger named them too (handled above).
    if type(combos) == "table" then
        for _, c in ipairs(combos) do
            local mode = c.mode
            if mode == "simultaneous" then
                local code = codeOf(c.key)
                if code ~= nil then
                    _watch[code] = true
                    _simul_by_code[code] = _simul_by_code[code] or {}
                    table.insert(_simul_by_code[code], { id = c.id, modifiers = c.modifiers or {} })
                end
            elseif mode == "sequence" then
                local codes = {}
                for _, name in ipairs(c.keys or {}) do
                    local code = codeOf(name)
                    if code ~= nil then _watch[code] = true; codes[#codes + 1] = code end
                end
                if #codes > 0 then
                    table.insert(_seq, { id = c.id, codes = codes,
                        timeout = (tonumber(c.timeoutMs) or 1000) / 1000, pos = 0, start = 0 })
                end
            elseif mode == "any" then
                for _, name in ipairs(c.keys or {}) do
                    local code = codeOf(name)
                    if code ~= nil then
                        _watch[code] = true
                        _any_by_code[code] = _any_by_code[code] or {}
                        table.insert(_any_by_code[code], c.id)
                    end
                end
            end
        end
    end

    -- Drop stale held flags so a release we now ignore can't wedge a future press.
    for code in pairs(_held) do
        if not _watch[code] then _held[code] = nil end
    end
end

-- Back-compat: old callers pass a plain array of key names.
function M.SetWatchKeys(list)
    M.SetWatch(list)
end

return M
