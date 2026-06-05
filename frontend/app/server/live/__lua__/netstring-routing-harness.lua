-- Harness for the #3 CLIENT routing: a coalesced batch envelope must dedup once by
-- seq, then fan each sub-command out by its OWN prefix (rules_/state_ -> RulesEngine,
-- else -> UIWidgets). Runs the REAL rules_engine.lua under fengari; UIWidgets is a
-- capture stub. The dispatcher mirrors modmain.lua's dstp_ui_dirty router VERBATIM
-- (kept in sync by the structural test that asserts modmain contains this logic).
-- Returns "OK" or "FAIL: <reasons>".

local C = KIT.new_checker()
local check = C.check

-- Mock _G with a valid ThePlayer (rules_engine installs listeners on it).
local fakePlayer = {
    IsValid = function() return true end,
    ListenForEvent = function() end,
    RemoveEventCallback = function() end,
}
local mock_G = KIT.make_G({ ThePlayer = fakePlayer })

local RulesEngine = KIT.load(MOD_RULES, "rules_engine.lua")
RulesEngine.Init({ GLOBAL = mock_G, modname = "DSTP" })

-- UIWidgets capture stub: record the actions it receives.
local ui_received = {}
local UIWidgets = { ProcessCommand = function(cmd) ui_received[#ui_received + 1] = cmd.action end }
RulesEngine.SetUIWidgets(UIWidgets)

-- ── Dispatcher: VERBATIM copy of modmain.lua's dstp_ui_dirty routing (lines wired in
-- the #3 fix). The structural test (mod-event-listeners-style) pins that modmain still
-- contains this exact shape. ──
local _dstp_ui_seq = -1
local function dispatch(c)
    if not (c and c.action) then return end
    local a = tostring(c.action)
    if a:sub(1, 6) == "rules_" or a:sub(1, 6) == "state_" then
        RulesEngine.ProcessCommand(c)
    else
        UIWidgets.ProcessCommand(c)
    end
end
local function onEnvelope(cmd)
    if cmd.action == "batch" then
        if cmd.seq then
            if cmd.seq <= _dstp_ui_seq then return end
            _dstp_ui_seq = cmd.seq
        end
        if cmd.commands then
            for _, sub in ipairs(cmd.commands) do dispatch(sub) end
        end
    else
        dispatch(cmd)
    end
end

-- ── Mixed batch: UI sub -> UIWidgets, rules/state subs -> RulesEngine ──
ui_received = {}
onEnvelope({ action = "batch", seq = 1, commands = {
    { action = "create", id = "p1" },
    { action = "rules_install", rules = { { id = "r1", when = { event = "player_attacked" }, ["do"] = {} } } },
    { action = "state_set", key = "hp", value = 42 },
} })
check("mixed: UI sub reached UIWidgets", #ui_received == 1 and ui_received[1] == "create")
check("mixed: rules sub installed a rule", RulesEngine.GetRuleCount() == 1)
check("mixed: state sub set player_state", RulesEngine.GetState("hp") == 42)

-- ── Envelope replay (same seq) is deduped: nothing applied a second time ──
ui_received = {}
onEnvelope({ action = "batch", seq = 1, commands = {
    { action = "create", id = "p1" },
    { action = "state_set", key = "hp", value = 999 },
} })
check("replay: deduped (UIWidgets not called again)", #ui_received == 0)
check("replay: deduped (state NOT overwritten)", RulesEngine.GetState("hp") == 42)

-- ── A NEW envelope (higher seq) is processed ──
ui_received = {}
onEnvelope({ action = "batch", seq = 2, commands = {
    { action = "state_set", key = "hp", value = 7 },
} })
check("new seq: processed", RulesEngine.GetState("hp") == 7)

-- ── Lower/stale seq after a higher one is dropped ──
onEnvelope({ action = "batch", seq = 1, commands = { { action = "state_set", key = "hp", value = -1 } } })
check("stale seq: dropped", RulesEngine.GetState("hp") == 7)

-- ── rules sub NEVER lands in UIWidgets (would be 'unknown action' there) ──
ui_received = {}
onEnvelope({ action = "batch", seq = 3, commands = {
    { action = "rules_uninstall", ids = { "r1" } },
} })
check("rules sub not routed to UIWidgets", #ui_received == 0)
check("rules_uninstall applied", RulesEngine.GetRuleCount() == 0)

-- ── RulesEngine handles a defensive 'batch' (pure-rules) without 'unknown action' ──
RulesEngine.ProcessCommand({ action = "batch", commands = {
    { action = "state_set", key = "z", value = 5 },
} })
check("rules_engine batch guard applies subs", RulesEngine.GetState("z") == 5)

return C.report()
