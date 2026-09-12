-- Harness for the #3 fix in core.lua Core.ProcessCommands: coalesce ALL six
-- _dstp_ui-writing families per player into ONE batch envelope (broadcasts expanded
-- per-player), stamped with a monotonic per-player seq. Runs the REAL core.lua under
-- fengari via the mod test kit. Returns "OK" or "FAIL: <reasons>".
--
-- We capture what the coalescer would :set() by registering a FAKE "ui_command"
-- handler that records data.cmd (the envelope) per userid, plus a catch-all for
-- non-UI commands to prove they pass straight through in order.

local C = KIT.new_checker()
local check = C.check

-- _G with a live AllPlayers list (broadcast expansion reads this).
local players = { { userid = "joe" }, { userid = "ann" } }
local mock_G = KIT.make_G({ AllPlayers = players })

local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(mock_G, KIT.fake_json, { server_id = "s", max_batch_size = 50, debug_logs = false })

-- Capture envelopes the coalescer emits (per userid) + non-UI passthrough order.
local envelopes = {}     -- userid -> { cmd = <envelope>, sets = <count> }
local passthrough = {}   -- ordered list of non-UI command types executed
Core.RegisterCommand("ui_command", function(data)
    local e = envelopes[data.userid]
    if not e then e = { sets = 0 }; envelopes[data.userid] = e end
    e.cmd = data.cmd
    e.sets = e.sets + 1
end)
Core.RegisterCommand("noop", function(_) passthrough[#passthrough + 1] = "noop" end)

local function reset() envelopes = {}; passthrough = {} end
local function env(uid) return envelopes[uid] and envelopes[uid].cmd end
local function subs(uid) local e = env(uid); return (e and e.commands) or {} end
local function actionsOf(uid)
    local out = {}
    for _, s in ipairs(subs(uid)) do out[#out + 1] = s.action end
    return table.concat(out, ",")
end

-- ── Mixed same-player same-sync: ui + rules + state all in ONE envelope, one set ──
reset()
Core.ProcessCommands({
    { type = "ui_command",      data = { userid = "joe", cmd = { action = "create", id = "p1" } } },
    { type = "install_rules",   data = { userid = "joe", rules = { { id = "r1" } }, seq = 111 } },
    { type = "set_player_state", data = { userid = "joe", key = "k", value = 7, seq = 111 } },
})
check("mixed: exactly one :set for joe", envelopes["joe"] and envelopes["joe"].sets == 1)
check("mixed: envelope is a batch", env("joe") and env("joe").action == "batch")
check("mixed: 3 subs in emit order", actionsOf("joe") == "create,rules_install,state_set")
check("mixed: envelope carries a seq", type(env("joe") and env("joe").seq) == "number")
check("mixed: sub seq is dropped (only envelope has seq)", subs("joe")[2].seq == nil)

-- ── Co-tick same backend seq must NOT drop anything (envelope seq replaces it) ──
reset()
Core.ProcessCommands({
    { type = "install_rules",    data = { userid = "joe", rules = { { id = "a" } }, seq = 999 } },
    { type = "set_player_state", data = { userid = "joe", key = "x", value = 1, seq = 999 } },
})
check("co-tick: both subs kept", actionsOf("joe") == "rules_install,state_set")

-- ── Broadcast + per-player overlap: install_rules_all + per-player ui_command ──
reset()
Core.ProcessCommands({
    { type = "install_rules_all", data = { rules = { { id = "g" } }, seq = 5 } },
    { type = "ui_command",        data = { userid = "joe", cmd = { action = "create", id = "p2" } } },
})
check("broadcast+pp: joe got rules_install AND create", actionsOf("joe") == "rules_install,create")
check("broadcast+pp: ann got the broadcast rules_install", actionsOf("ann") == "rules_install")
check("broadcast+pp: one :set per player", envelopes["joe"].sets == 1 and envelopes["ann"].sets == 1)

-- ── Dual broadcast: ui_broadcast + install_rules_all → every player gets both ──
reset()
Core.ProcessCommands({
    { type = "ui_broadcast",      data = { cmd = { action = "create", id = "note" } } },
    { type = "install_rules_all", data = { rules = { { id = "g2" } }, seq = 6 } },
})
check("dual-broadcast: joe got both", actionsOf("joe") == "create,rules_install")
check("dual-broadcast: ann got both", actionsOf("ann") == "create,rules_install")

-- ── Ordering: ui clear THEN rule install preserved within the envelope ──
reset()
Core.ProcessCommands({
    { type = "ui_command",    data = { userid = "joe", cmd = { action = "clear" } } },
    { type = "install_rules", data = { userid = "joe", rules = { { id = "r2" } }, seq = 1 } },
})
check("ordering: [clear, rules_install]", actionsOf("joe") == "clear,rules_install")

-- ── Monotonic seq: each ProcessCommands bumps the player's envelope seq ──
reset()
Core.ProcessCommands({ { type = "ui_command", data = { userid = "joe", cmd = { action = "create", id = "s1" } } } })
local seq1 = env("joe").seq
reset()
Core.ProcessCommands({ { type = "ui_command", data = { userid = "joe", cmd = { action = "create", id = "s2" } } } })
local seq2 = env("joe").seq
check("monotonic: seq strictly increases per player", seq2 > seq1)

-- ── Single-sub still wrapped in a batch carrying seq (uniform dedup point) ──
reset()
Core.ProcessCommands({ { type = "install_rules", data = { userid = "joe", rules = { { id = "solo" } }, seq = 2 } } })
check("single-sub: wrapped in batch", env("joe") and env("joe").action == "batch")
check("single-sub: batch carries seq", type(env("joe").seq) == "number")
check("single-sub: one sub", #subs("joe") == 1 and subs("joe")[1].action == "rules_install")

-- ── Non-UI commands pass straight through (not coalesced), preserving order ──
reset()
Core.ProcessCommands({
    { type = "noop", data = {} },
    { type = "ui_command", data = { userid = "joe", cmd = { action = "create", id = "z" } } },
    { type = "noop", data = {} },
})
check("passthrough: 2 non-UI commands executed", #passthrough == 2)
check("passthrough: joe still got his UI envelope", env("joe") ~= nil)

-- ── CROSS-POLL outbox: two syncs 100 ms apart must NOT :set twice back-to-back ──
-- In-game (2026-09-12) the login panel's envelope, sent one poll after the wallet's,
-- never reached the client: two :set() on the same net_string inside one network
-- tick → the first is overwritten before it replicates. With a world clock available
-- (TheWorld:DoTaskInTime) the coalescer holds an OUTBOX per player and flushes it
-- once per `ui_flush_delay`, merging everything that arrived meanwhile.
reset()
local scheduled = {}
mock_G.TheWorld.DoTaskInTime = function(_, delay, fn) scheduled[#scheduled + 1] = { delay = delay, fn = fn }; return { Cancel = function() end } end
Core.ProcessCommands({ { type = "ui_command", data = { userid = "joe", cmd = { action = "create", id = "wallet" } } } })
Core.ProcessCommands({ { type = "ui_command", data = { userid = "joe", cmd = { action = "create", id = "auth" } } } })
check("outbox: nothing :set before the flush fires", (envelopes["joe"] and envelopes["joe"].sets or 0) == 0)
check("outbox: ONE flush scheduled for the two polls", #scheduled == 1)
scheduled[1].fn()
check("outbox: one :set carrying BOTH creates in order", envelopes["joe"] and envelopes["joe"].sets == 1 and actionsOf("joe") == "create,create"
    and subs("joe")[1].id == "wallet" and subs("joe")[2].id == "auth")
-- after the flush a new poll schedules a new flush (not silently dropped)
Core.ProcessCommands({ { type = "ui_command", data = { userid = "joe", cmd = { action = "create", id = "later" } } } })
check("outbox: next poll schedules a fresh flush", #scheduled == 2)
scheduled[2].fn()
check("outbox: second flush delivers the later create", envelopes["joe"].sets == 2 and subs("joe")[1].id == "later")
local s1 = nil
-- seq keeps increasing across flushes
check("outbox: envelope seq is monotonic", env("joe").seq == 2 or env("joe").seq > 1)
mock_G.TheWorld.DoTaskInTime = nil

return C.report()
