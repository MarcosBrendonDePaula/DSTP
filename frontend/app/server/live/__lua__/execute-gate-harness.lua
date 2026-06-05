-- Harness for the #4 ALLOW_EXECUTE gate on the `execute` command. Loads the REAL
-- core.lua AND commands.lua under fengari, registers all handlers, and drives the
-- `execute` handler with the flag on/off. Proves: off -> Lua does NOT run (kill
-- switch); on -> Lua runs (default behavior); and an infinite-loop execute is aborted
-- by the watchdog rather than hanging. Returns "OK" or "FAIL: <reasons>".

local C = KIT.new_checker()
local check = C.check

-- Capture LogError output to assert the "disabled" path.
local errors = {}
local mock_G = KIT.make_G()

local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(mock_G, KIT.fake_json, { server_id = "s" })
-- Wrap LogError to capture (Core.LogError is what commands.lua aliases).
Core.LogError = function(m) errors[#errors + 1] = tostring(m) end

local Commands = KIT.load(MOD_COMMANDS, "commands.lua")
Commands.RegisterAll(Core)

local function run_execute(lua_src)
    errors = {}
    return Core.ExecuteCommand({ type = "execute", data = { lua = lua_src } })
end

-- A side-channel the executed Lua can write to (it runs with full _G).
mock_G.HIT = nil

-- ── Flag ON (default): execute runs the Lua ──
Core.config.allow_execute = true
run_execute("HIT = 1")
check("allow on: Lua ran (side effect applied)", mock_G.HIT == 1)
check("allow on: no 'disabled' error", #errors == 0)

-- ── Flag OFF: execute is a no-op + logs a disabled message ──
mock_G.HIT = nil
Core.config.allow_execute = false
run_execute("HIT = 2")
check("allow off: Lua did NOT run", mock_G.HIT == nil)
check("allow off: logged disabled", #errors == 1 and errors[1]:find("disabled") ~= nil)

-- ── Flag ON + infinite loop: aborted by the watchdog, does not hang ──
Core.config.allow_execute = true
Core.config.max_execute_ops = 50000
local logged_before = #errors
run_execute("while true do end")
check("infinite execute: aborted (test did not hang) and logged failure", #errors >= 1)
local last = errors[#errors]
check("infinite execute: failure mentions budget/loop", last ~= nil and (last:find("budget") ~= nil or last:find("Execute failed") ~= nil))

-- ── Flag ON default really is the config default (core.lua sets allow_execute=true) ──
local Core2 = KIT.load(MOD_COMMANDS and MOD_CORE, "core.lua")
Core2.Init(KIT.make_G(), KIT.fake_json, {})  -- no allow_execute in cfg
check("default: allow_execute defaults to true", Core2.config.allow_execute == true)

return C.report()
