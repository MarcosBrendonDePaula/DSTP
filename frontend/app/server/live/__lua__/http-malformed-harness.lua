-- Test harness for DST_MOD/scripts/dstp/http.lua — backend RESILIENCE.
--
-- Symptom in-game: when the backend returns HTTP 200 with a well-formed JSON body
-- whose FIELDS are the wrong type (e.g. enable_events / debounce / commands is a
-- string or number instead of a table/array), the response handler did unguarded
-- `pairs()` / `ipairs()` over it and the error escaped the QueryServer callback —
-- crashing the game. A failed/offline backend is already handled (#17); this is the
-- "backend up but answering garbage" case.
--
-- This harness fires the QueryServer callback with malformed decoded bodies. Because
-- runLuaHarness() THROWS on an uncaught Lua runtime error, an unguarded handler makes
-- the whole harness throw (mirrors "the game crashes"). A handler that contains the
-- error (pcall + type guards) lets every case return and the harness reports "OK".
--
-- Returns "OK" if every malformed body is survived, else "FAIL: <reasons>".

local C = KIT.new_checker()
local check = C.check

local captured_cb
local mock_G = KIT.make_G({
  TheNet = { GetClientTable = function() return { { userid = "u1" } } end },
  TheSim = {
    QueryServer = function(self, url, cb, method, body) captured_cb = cb end,
  },
})

-- These mocks do the SAME dangerous iteration the real consumers do (chat.lua's
-- HotToggleEvents pairs() over the request; core.ProcessCommands ipairs() over the
-- command list). If http.lua passes a non-table straight through, these blow up —
-- exactly as they would in-game.
local core = {
  _G = mock_G,
  config = { server_id = "s", shard_id = "s:master", shard_type = "master",
             backend_url = "http://x", max_batch_size = 50, poll_interval = 5 },
  state = { connected = true, connection_errors = 0, last_successful_poll = 0,
            event_queue = {}, poll_in_flight = false },
  evt_config = {},
  event_debounce = {},
  SafeEncode = KIT.fake_json.encode,
  SafeDecode = KIT.fake_json.decode,
  ProcessCommands = function(commands) for _ in ipairs(commands) do end end,
  HotToggleEvents = function(req) for _ in pairs(req) do end end,
  SetWatchKeys = function(list) for _ in pairs(list) do end end,
  LogError = function() end,
}
local collectors = {
  GetServerInfo = function() return {} end,
  GetAllPlayersData = function() return {} end,
  RefreshClientTable = function() end,
}

local Http = KIT.load(MOD_HTTP, "http.lua")
Http.Init(core, collectors)

local pending_fn
local inst = { DoTaskInTime = function(self, delay, fn) pending_fn = fn end }
Http.Start(inst)
local function runPoll() local fn = pending_fn; pending_fn = nil; fn() end

-- Fire a poll, then deliver a 200 with the given decoded body. Wrapped in pcall so a
-- crash is recorded as a failed check (not a harness throw) — we WANT to see which
-- body crashes, per case.
local function deliver(body, label)
  KIT.decode_result = body
  core.state.poll_in_flight = false
  runPoll()
  local ok, err = pcall(function() captured_cb("BODY", true, 200) end)
  check(label .. " survived (no crash)", ok, ok and "" or tostring(err))
  return ok
end

-- ── Malformed field types that previously crashed ──────────────────────────
deliver({ enable_events = "not_a_table" }, "enable_events as string")
deliver({ enable_events = 123 },           "enable_events as number")
deliver({ debounce = "nope" },             "debounce as string")
deliver({ debounce = 7 },                  "debounce as number")
deliver({ watch_keys = "k" },              "watch_keys as string")
deliver({ commands = "kick" },             "commands as string")
deliver({ commands = 5 },                  "commands as number")
-- commands as a map (not an array) — `#` is 0 so it's skipped; still must not crash.
deliver({ commands = { foo = "bar" } },    "commands as non-array table")
-- A pile of wrong types at once.
deliver({ enable_events = 1, debounce = "x", watch_keys = 2, commands = "y",
          request_prefabs = "maybe" },     "all fields malformed")
-- Body decoded to a non-table entirely (e.g. backend sent `"true"` or `42`).
deliver("a bare string body",              "body is a bare string")
deliver(42,                                "body is a bare number")

-- ── Sanity: a WELL-FORMED body still works after the guards ─────────────────
local toggled = false
core.HotToggleEvents = function(req) toggled = true; for _ in pairs(req) do end end
KIT.decode_result = { enable_events = { combat = true }, debounce = { health_delta = 2 } }
core.state.poll_in_flight = false
runPoll()
local ok = pcall(function() captured_cb("BODY", true, 200) end)
check("well-formed body still processed", ok and toggled, tostring(ok) .. "/" .. tostring(toggled))
check("debounce applied from valid body", core.event_debounce.health_delta == 2)

-- ── A crash INSIDE DoPoll must not kill the self-scheduling loop ─────────────
-- Re-create the Http with a fake inst that records every DoTaskInTime so we can
-- prove the loop keeps scheduling even when a poll throws.
do
  local schedule_count = 0
  local last_fn
  local inst2 = { DoTaskInTime = function(self, delay, fn)
    schedule_count = schedule_count + 1
    last_fn = fn
  end }
  -- Make the very next poll explode: a collector that throws (bad game state).
  collectors.GetServerInfo = function() error("boom from collector") end
  local Http2 = KIT.load(MOD_HTTP, "http.lua")
  Http2.Init(core, collectors)
  Http2.Start(inst2)                       -- schedules the first poll (count=1)
  check("loop: first poll scheduled", schedule_count == 1)
  local ok = pcall(function() last_fn() end)  -- runs SafePoll (poll throws) + ScheduleNextPoll
  check("loop: crashing poll did NOT escape", ok)
  check("loop: next poll still scheduled after crash", schedule_count == 2)
  check("loop: in-flight guard released after crash", core.state.poll_in_flight == false)
end

return C.report()
