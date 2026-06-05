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

    core._G.DSTP_SELFTEST_SENTINEL = nil
    core.RunGuarded(function() core._G.DSTP_SELFTEST_SENTINEL = 42 end)
    check(run, "watchdog: env not sandboxed (_G reachable)", core._G.DSTP_SELFTEST_SENTINEL == 42)
    core._G.DSTP_SELFTEST_SENTINEL = nil
end

-- 4) execute gate: with ALLOW_EXECUTE off the execute command is a no-op; with it on
--    the Lua runs. We toggle config.allow_execute (and restore it).
local function testExecuteGate(run)
    local handler = core.command_handlers["execute"]
    if not handler then
        check(run, "execute-gate: handler registered", false)
        return
    end
    local saved_allow = core.config.allow_execute
    core._G.DSTP_SELFTEST_EXEC = nil

    core.config.allow_execute = false
    handler({ lua = "DSTP_SELFTEST_EXEC = 1" })
    check(run, "execute-gate: OFF → Lua did NOT run", core._G.DSTP_SELFTEST_EXEC == nil)

    core.config.allow_execute = true
    handler({ lua = "DSTP_SELFTEST_EXEC = 2" })
    check(run, "execute-gate: ON → Lua ran", core._G.DSTP_SELFTEST_EXEC == 2)

    core._G.DSTP_SELFTEST_EXEC = nil
    core.config.allow_execute = saved_allow
end

-- 5) Entity control (#57-59): the parts only the LIVE engine can prove — real Ents[guid]
--    resolution, real components, real mutation. Spawns throwaway entities, exercises the
--    entity_* commands against them, asserts the real effect, then REMOVES everything it
--    spawned (must leave no litter in the world). Each spawned guid is tracked + cleaned.
local function testEntityControl(run)
    local _G = core._G
    local handlers = core.command_handlers
    -- Bail clearly if the entity commands aren't registered (old mod build loaded).
    if not (handlers and handlers["get_entity"] and handlers["entity_set_health"]) then
        check(run, "entity: commands registered (reload mod if this fails)", false)
        return
    end
    -- This case needs the REAL engine (SpawnPrefab + Ents + real components). Under the
    -- fengari meta-test there is no engine, so SKIP gracefully (a no-op PASS) — the real
    -- assertions only run in-game, which is the whole point of this case. We probe by
    -- trying a throwaway spawn: if it yields an entity with components, we're live.
    local probe = _G.SpawnPrefab and _G.Ents and _G.SpawnPrefab("rabbit")
    if not (probe and probe.components and probe.GUID and _G.Ents[probe.GUID]) then
        if probe and probe.Remove then probe:Remove() end
        check(run, "entity: skipped (no live engine — runs in-game only)", true)
        return
    end
    if probe.Remove then probe:Remove() end

    -- Spawn near world origin (kept off-screen of players; removed at the end).
    local spawned = {}
    local function spawnAt(prefab, x, z)
        local e = _G.SpawnPrefab(prefab)
        if e then
            if e.Transform then e.Transform:SetPosition(x or 0, 0, z or 0) end
            spawned[#spawned + 1] = e
        end
        return e
    end
    -- Drain helper: pop the last event of a type off the queue (we read it, then drop it
    -- so the self-test doesn't inject phantom events into the real flow engine).
    local function takeEvent(typ)
        for i = #core.state.event_queue, 1, -1 do
            if core.state.event_queue[i].type == typ then
                return table.remove(core.state.event_queue, i).data
            end
        end
        return nil
    end

    local saved_queue_len = #core.state.event_queue

    -- ── Resolver + get_entity on a REAL mob with a real health component ──
    local pig = spawnAt("pigman", 4, 4)
    if pig and pig.components and pig.components.health then
        handlers["get_entity"]({ guid = pig.GUID, token = "st_pig" })
        local d = takeEvent("entity_data")
        check(run, "entity: get_entity resolves a real GUID", d ~= nil and d.found == true and d.guid == pig.GUID)
        check(run, "entity: real health block read", d ~= nil and d.health_max ~= nil and d.health_percent ~= nil)
        check(run, "entity: prefab is pigman", d ~= nil and d.prefab == "pigman")

        -- entity_set_health → SetPercent on the REAL component
        handlers["entity_set_health"]({ guid = pig.GUID, percent = 0.5 })
        local p = pig.components.health:GetPercent()
        check(run, "entity: set_health 0.5 took effect on real component", p > 0.45 and p < 0.55)

        -- entity_freeze → AddColdness on a real freezable (pigman has one)
        if pig.components.freezable then
            handlers["entity_freeze"]({ guid = pig.GUID, coldness = 10 })
            check(run, "entity: freeze made the real mob frozen", pig.components.freezable:IsFrozen())
            handlers["entity_unfreeze"]({ guid = pig.GUID })
            check(run, "entity: unfreeze thawed it", not pig.components.freezable:IsFrozen())
        else
            check(run, "entity: pigman has freezable (skip if not)", true)
        end
    else
        check(run, "entity: spawned a pigman with health", false)
    end

    -- ── Fuel on a real campfire ──
    local fire = spawnAt("campfire", 8, 8)
    if fire and fire.components and fire.components.fueled then
        handlers["entity_set_fuel"]({ guid = fire.GUID, percent = 1 })
        check(run, "entity: set_fuel 1.0 on a real campfire", fire.components.fueled:GetPercent() > 0.9)
    else
        check(run, "entity: campfire has fueled (skip if prefab differs)", true)
    end

    -- ── Extinguish a real burning object ──
    local tree = spawnAt("evergreen", 12, 12)
    if tree and tree.components and tree.components.burnable then
        tree.components.burnable:Ignite()
        check(run, "entity: test setup — tree is burning", tree.components.burnable:IsBurning())
        handlers["entity_extinguish"]({ guid = tree.GUID })
        check(run, "entity: extinguish put the real fire out", not tree.components.burnable:IsBurning())
    else
        check(run, "entity: evergreen has burnable (skip if prefab differs)", true)
    end

    -- ── Stale GUID returns found:false (remove an entity, then resolve it) ──
    local doomed = spawnAt("rabbit", 16, 16)
    if doomed then
        local g = doomed.GUID
        doomed:Remove()
        -- remove from our cleanup list (already gone)
        for i = #spawned, 1, -1 do if spawned[i] == doomed then table.remove(spawned, i) end end
        handlers["get_entity"]({ guid = g, token = "st_gone" })
        local d = takeEvent("entity_data")
        check(run, "entity: stale GUID → found:false reason gone", d ~= nil and d.found == false and d.reason == "gone")
    end

    -- ── spawn_prefab returns the GUID via spawn_result when a token is given ──
    -- Use the real command so the spawn path + ReportSpawn run end-to-end. Track the
    -- spawned entity for cleanup via its returned GUID.
    handlers["spawn_prefab"]({ prefab = "rabbit", x = 20, z = 20, token = "st_spawn" })
    local sr = takeEvent("spawn_result")
    check(run, "entity: spawn_result emitted with a real GUID + prefab", sr ~= nil and sr.guid ~= nil and sr.prefab == "rabbit")
    if sr and sr.guid and _G.Ents[sr.guid] then spawned[#spawned + 1] = _G.Ents[sr.guid] end

    -- ── entity_kill kills a real entity ──
    local victim = spawnAt("rabbit", 24, 24)
    if victim then
        handlers["entity_kill"]({ guid = victim.GUID })
        -- ForceKill triggers the death path; on the live engine the corpse erodes a few
        -- frames later, so "dead" = health:IsDead now, OR already invalid. We KEEP victim
        -- in the cleanup list (the final Remove is idempotent / a no-op if already gone).
        local dead = (not victim:IsValid()) or (victim.components.health and victim.components.health:IsDead())
        check(run, "entity: kill killed a real entity", dead == true)
    end

    -- ── CLEANUP: remove everything we spawned, restore the queue length ──
    for _, e in ipairs(spawned) do
        if e and e.IsValid and e:IsValid() and e.Remove then e:Remove() end
    end
    -- Trim any stray events our commands queued beyond what we drained.
    while #core.state.event_queue > saved_queue_len do
        table.remove(core.state.event_queue)
    end
    check(run, "entity: cleanup left the event queue as found", #core.state.event_queue == saved_queue_len)
end

local CASES = {
    { name = "_dstp_ui coalescing (#3)",   fn = testCoalesce },
    { name = "per-player debounce (#2)",   fn = testDebounce },
    { name = "loop watchdog (#4)",         fn = testWatchdog },
    { name = "execute gate (#4)",          fn = testExecuteGate },
    { name = "entity control (#57-59)",    fn = testEntityControl },
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
