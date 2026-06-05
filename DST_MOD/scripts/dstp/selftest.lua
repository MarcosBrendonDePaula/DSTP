-- DSTP Self-Test — in-game assertions that run in the REAL DST master sim.
--
-- Triggered by an admin typing `#selftest` in chat (see chat.lua). Unlike the fengari
-- test kit (which runs the mod's Lua in JS), this exercises the SAME code on the live
-- engine: real debug.sethook preemption, real loadstring/setfenv (Lua 5.1), real
-- coroutine scheduling. It is a focused smoke test of the trickiest logic — the parts
-- whose behavior is engine-specific — not a full re-run of the unit suite.
--
-- A "mechanic module" (singleton, required once, small public API). It MUTATES core
-- state (event_queue, debounce timers, config.allow_execute) so it SAVES and RESTORES
-- everything it touches — running #selftest must not disturb the live mod.
--
-- M.Init(core) wires deps; M.Run() returns { passed, failed, lines } and logs each
-- case to the server log via core.LogInfo (visible in server_log.txt).

local M = {}

local core

function M.Init(c)
    core = c
    return M
end

-- ── tiny assertion harness ────────────────────────────────────────────────
local function newRun()
    return { passed = 0, failed = 0, lines = {} }
end

local function check(run, label, cond)
    if cond then
        run.passed = run.passed + 1
        run.lines[#run.lines + 1] = "  PASS  " .. label
    else
        run.failed = run.failed + 1
        run.lines[#run.lines + 1] = "  FAIL  " .. label
    end
end

-- ── Test cases. Each gets (run); they must leave core state as they found it. ──

-- 1) _dstp_ui coalescing: many families for one player → ONE batch envelope, set once,
--    with a monotonic seq; broadcasts expand per-player. We capture by registering a
--    temporary ui_command handler.
local function testCoalesce(run)
    local saved_handlers = core.command_handlers
    local saved_seq = core.ui_seq_by_user
    -- Fresh registry + seq so we don't fire real net_string sets.
    core.command_handlers = {}
    core.ui_seq_by_user = {}
    local envelopes = {}
    core.command_handlers["ui_command"] = function(data)
        envelopes[data.userid] = (envelopes[data.userid] or { n = 0 })
        envelopes[data.userid].cmd = data.cmd
        envelopes[data.userid].n = envelopes[data.userid].n + 1
    end
    core.command_handlers["noop"] = function() end

    -- Two real players in the live AllPlayers? We don't depend on that — install a
    -- temporary AllPlayers stub for the broadcast-expansion case only.
    local saved_all = core._G.AllPlayers
    core._G.AllPlayers = { { userid = "selftest_a" }, { userid = "selftest_b" } }

    core.ProcessCommands({
        { type = "ui_command",       data = { userid = "selftest_a", cmd = { action = "create", id = "x" } } },
        { type = "install_rules",    data = { userid = "selftest_a", rules = { { id = "r" } } } },
        { type = "install_rules_all", data = { rules = { { id = "g" } } } },
    })
    local ea = envelopes["selftest_a"]
    check(run, "coalesce: one :set for player A", ea ~= nil and ea.n == 1)
    check(run, "coalesce: envelope is a batch with seq", ea ~= nil and ea.cmd and ea.cmd.action == "batch" and type(ea.cmd.seq) == "number")
    local subs = ea and ea.cmd and ea.cmd.commands or {}
    local acts = {}
    for _, s in ipairs(subs) do acts[#acts + 1] = s.action end
    check(run, "coalesce: A got create+rules_install+broadcast rules", table.concat(acts, ",") == "create,rules_install,rules_install")
    check(run, "coalesce: broadcast reached player B", envelopes["selftest_b"] ~= nil)

    -- restore
    core._G.AllPlayers = saved_all
    core.command_handlers = saved_handlers
    core.ui_seq_by_user = saved_seq
end

-- 2) Per-player debounce: two players in the same window both pass; same player twice
--    is throttled. Uses health_delta (debounced 1s). Saves/restores the queue.
local function testDebounce(run)
    local saved_queue = core.state.event_queue
    core.state.event_queue = {}
    local n0 = #core.state.event_queue
    core.PushEvent("health_delta", { userid = "selftest_a" })
    core.PushEvent("health_delta", { userid = "selftest_b" })
    check(run, "debounce: two players pass in same window", #core.state.event_queue - n0 == 2)
    local n1 = #core.state.event_queue
    core.PushEvent("health_delta", { userid = "selftest_a" })  -- within 1s → dropped
    check(run, "debounce: same player throttled within window", #core.state.event_queue - n1 == 0)
    core.state.event_queue = saved_queue
end

-- 3) RunGuarded watchdog: an infinite loop is aborted (returns ok=false) instead of
--    freezing; normal code runs; the env is NOT sandboxed.
local function testWatchdog(run)
    local ok1 = core.RunGuarded(function() return 1 + 1 end)
    check(run, "watchdog: normal code runs (ok)", ok1 == true)

    local saved_ops = core.config.max_execute_ops
    core.config.max_execute_ops = 200000  -- keep the abort quick
    local ok2 = core.RunGuarded(function() while true do end end)
    check(run, "watchdog: infinite loop ABORTED (did not freeze)", ok2 == false)
    core.config.max_execute_ops = saved_ops

    -- Prove the env is NOT sandboxed: the guarded fn can reach _G. DST runs strict
    -- mode, so a NEW global must be created via rawset (a bare `_G.X = v` assignment
    -- raises "assign to undeclared variable"). We write a sentinel and read it back.
    local rawset, rawget = core._G.rawset, core._G.rawget
    rawset(core._G, "DSTP_SELFTEST_SENTINEL", nil)
    core.RunGuarded(function() rawset(core._G, "DSTP_SELFTEST_SENTINEL", 42) end)
    check(run, "watchdog: env not sandboxed (_G reachable)", rawget(core._G, "DSTP_SELFTEST_SENTINEL") == 42)
    rawset(core._G, "DSTP_SELFTEST_SENTINEL", nil)
end

-- 4) execute gate: with ALLOW_EXECUTE off the execute command is a no-op; with it on
--    the Lua runs. We toggle config.allow_execute (and restore it).
local function testExecuteGate(run)
    local handler = core.command_handlers["execute"]
    if not handler then
        check(run, "execute-gate: handler registered", false)
        return
    end
    local rawset = core._G.rawset
    local saved_allow = core.config.allow_execute
    -- Use a sentinel TABLE that already exists in the env, so the executed snippet only
    -- MUTATES A FIELD (`DSTP_TEST.exec = N`) instead of creating a new global — the
    -- latter is forbidden by DST strict mode even when execute is allowed. We install
    -- the table via rawset (creating the global once) and remove it after.
    local sentinel = { exec = nil }
    rawset(core._G, "DSTP_TEST", sentinel)

    core.config.allow_execute = false
    handler({ lua = "DSTP_TEST.exec = 1" })
    check(run, "execute-gate: OFF → Lua did NOT run", sentinel.exec == nil)

    core.config.allow_execute = true
    handler({ lua = "DSTP_TEST.exec = 2" })
    check(run, "execute-gate: ON → Lua ran", sentinel.exec == 2)

    rawset(core._G, "DSTP_TEST", nil)
    core.config.allow_execute = saved_allow
end

local CASES = {
    { name = "_dstp_ui coalescing (#3)",   fn = testCoalesce },
    { name = "per-player debounce (#2)",   fn = testDebounce },
    { name = "loop watchdog (#4)",         fn = testWatchdog },
    { name = "execute gate (#4)",          fn = testExecuteGate },
}

-- Run every case, logging to the server log. Each case is pcall'd so one crash
-- doesn't abort the rest (and a crash counts as a failure).
function M.Run()
    local run = newRun()
    core.LogInfo("===== DSTP SELF-TEST =====")
    for _, case in ipairs(CASES) do
        core.LogInfo("[selftest] " .. case.name)
        local ok, err = core._G.pcall(case.fn, run)
        if not ok then
            run.failed = run.failed + 1
            run.lines[#run.lines + 1] = "  FAIL  " .. case.name .. " (crashed: " .. tostring(err) .. ")"
        end
    end
    for _, line in ipairs(run.lines) do core.LogInfo(line) end
    core.LogInfo(string.format("===== SELF-TEST DONE: %d passed, %d failed =====", run.passed, run.failed))
    return run
end

return M
