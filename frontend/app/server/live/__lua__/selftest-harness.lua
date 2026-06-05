-- Meta-test: verify the in-game self-test module itself is correct, by running the
-- REAL selftest.lua (with real core.lua + commands.lua) under fengari. If #selftest
-- would report a false failure in-game, this catches it here. Returns "OK"/"FAIL: ...".
--
-- It also asserts the self-test RESTORES the core state it mutates (queue, seq,
-- allow_execute) so running #selftest never disturbs the live mod.

local C = KIT.new_checker()
local check = C.check

local mock_G = KIT.make_G({ AllPlayers = {} })

local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(mock_G, KIT.fake_json, { server_id = "s", max_batch_size = 50 })
-- LogInfo would print a lot; silence it for the harness.
Core.LogInfo = function() end

local Commands = KIT.load(MOD_COMMANDS, "commands.lua")
Commands.RegisterAll(Core)

local SelfTest = KIT.load(MOD_SELFTEST, "selftest.lua")
SelfTest.Init(Core)

-- Snapshot the state the self-test is supposed to restore.
local before_queue = Core.state.event_queue
local before_allow = Core.config.allow_execute
local before_all = Core._G.AllPlayers
local before_handlers = Core.command_handlers

local run = SelfTest.Run()

-- Every case must pass (the self-test is asserting REAL, correct mod behavior).
check("selftest ran cases", run ~= nil and (run.passed + run.failed) >= 8)
check("selftest: zero failures (the mod logic is correct)", run ~= nil and run.failed == 0)

-- And it must have restored what it touched.
check("restore: event_queue table identity preserved", Core.state.event_queue == before_queue)
check("restore: allow_execute unchanged", Core.config.allow_execute == before_allow)
check("restore: AllPlayers unchanged", Core._G.AllPlayers == before_all)
check("restore: command_handlers registry preserved", Core.command_handlers == before_handlers)
check("restore: no sentinel leaked into _G", Core._G.DSTP_SELFTEST_SENTINEL == nil and Core._G.DSTP_SELFTEST_EXEC == nil)

return C.report()
