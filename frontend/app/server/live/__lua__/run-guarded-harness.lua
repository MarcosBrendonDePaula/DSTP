-- Harness for the #4 fix in core.lua Core.RunGuarded: an instruction-budget watchdog
-- (debug.sethook on a coroutine) that aborts a runaway loop so admin RCE
-- (execute/call_component) can't freeze the single-threaded master sim, WITHOUT
-- sandboxing the env (capability is unchanged — it's admin RCE by design).
-- Runs the REAL core.lua under fengari. Returns "OK" or "FAIL: <reasons>".

local C = KIT.new_checker()
local check = C.check

local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(KIT.make_G(), KIT.fake_json, { server_id = "s", max_execute_ops = 100000 })

-- ── Normal code runs and reports success ──
local ran = false
local ok, err = Core.RunGuarded(function() ran = true end)
check("normal: ok=true", ok == true)
check("normal: body executed", ran == true)

-- ── Return-value path: a body that errors surfaces ok=false ──
local ok2, err2 = Core.RunGuarded(function() error("boom") end)
check("error body: ok=false", ok2 == false)
check("error body: message present", type(err2) == "string" and err2:find("boom") ~= nil)

-- ── Infinite loop is ABORTED (the whole point): without the watchdog this hangs ──
local ok3, err3 = Core.RunGuarded(function() while true do end end)
check("infinite loop: ok=false (aborted, did not hang)", ok3 == false)
check("infinite loop: budget message", type(err3) == "string" and err3:find("budget") ~= nil)

-- ── The env is NOT sandboxed: the function can touch _G (admin RCE preserved) ──
Core._G.SENTINEL = nil
local ok4 = Core.RunGuarded(function() Core._G.SENTINEL = 42 end)
check("env not sandboxed: ok", ok4 == true)
check("env not sandboxed: _G mutated", Core._G.SENTINEL == 42)

-- ── A heavy-but-finite body within budget completes (budget isn't too tight) ──
local sum = 0
local ok5 = Core.RunGuarded(function()
    for i = 1, 10000 do sum = sum + i end
end)
check("finite heavy body: ok", ok5 == true)
check("finite heavy body: completed", sum == 50005000)

-- ── Fallback: if debug.sethook is unavailable, behaves like a plain pcall ──
local G2 = KIT.make_G()
G2.debug = nil  -- simulate a build/debugger state without sethook
local Core2 = KIT.load(MOD_CORE, "core.lua")
Core2.Init(G2, KIT.fake_json, { server_id = "s2" })
local okf, errf = Core2.RunGuarded(function() error("plain") end)
check("fallback: still returns pcall-style ok=false", okf == false)
check("fallback: normal body still runs", (Core2.RunGuarded(function() end)) == true)

return C.report()
