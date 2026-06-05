-- Test harness for DST_MOD/scripts/dstp/http.lua — exercises the #17 fix (drain the
-- event queue only AFTER a confirmed POST; hold events for retry on failure).
--
-- Runs the REAL http.lua under fengari (Lua-in-JS) with mocked _G/core/collectors.
-- The JS side passes the http.lua source as the global `HTTP_SRC`; this script loads
-- it, drives Http.Start with a fake `inst` whose DoTaskInTime we capture, then fires
-- the captured poll fn and a mocked QueryServer callback for success/failure cases.
--
-- Returns a single string: "OK" if every assertion holds, else "FAIL: <reason>".

local results = {}
local function check(name, cond) if not cond then results[#results+1] = name end end

-- ── Mock _G (the DST globals http.lua reaches through core._G) ──────────────
local now = 1000
local captured_cb           -- the QueryServer callback (we fire it manually)
local last_query_payload    -- body sent on the last QueryServer call
local query_calls = 0

local mock_G = {
  GetTime = function() return now end,
  TheWorld = { ismastersim = true },
  TheNet = { GetClientTable = function() return { { userid = "u1" } } end },
  TheSim = {
    QueryServer = function(self, url, cb, method, body)
      query_calls = query_calls + 1
      captured_cb = cb
      last_query_payload = body
    end,
  },
}

-- ── Mock core + collectors ──────────────────────────────────────────────────
local core = {
  _G = mock_G,
  config = { server_id = "s", shard_id = "s:master", shard_type = "master",
             backend_url = "http://x", max_batch_size = 50, poll_interval = 5 },
  state = { connected = false, connection_errors = 0, last_successful_poll = 0,
            event_queue = {}, poll_in_flight = false },
  evt_config = {},
  event_debounce = {},
  -- pass-through codecs: encode returns a marker string, decode returns a fixed table
  SafeEncode = function(t) return "ENCODED" end,
  SafeDecode = function(s) return { commands = {} } end,
  ProcessCommands = function() end,
  LogError = function() end,
}
local collectors = {
  GetServerInfo = function() return {} end,
  GetAllPlayersData = function() return {} end,
  RefreshClientTable = function() end,
}

-- ── Load the real module ────────────────────────────────────────────────────
local chunk, err = load(HTTP_SRC, "http.lua")
if not chunk then return "FAIL: load error: " .. tostring(err) end
local Http = chunk()
Http.Init(core, collectors)

-- Drive Http.Start with a fake inst; capture the scheduled poll fn instead of timing.
local pending_fn
local inst = { DoTaskInTime = function(self, delay, fn) pending_fn = fn end }
Http.Start(inst)
-- Http.Start scheduled the FIRST poll (delay 2). Run it; it calls DoPoll then
-- ScheduleNextPoll (which re-captures pending_fn — we don't run that one).
local function runPoll()
  local fn = pending_fn
  pending_fn = nil
  fn()  -- DoPoll() + ScheduleNextPoll()
end

-- Seed 3 events in the queue.
core.state.event_queue = {
  { type = "a", id = 1 }, { type = "b", id = 2 }, { type = "c", id = 3 },
}

-- ── Case 1: successful POST drains the sent events ──────────────────────────
runPoll()
check("c1: QueryServer called", query_calls == 1)
check("c1: in_flight set during poll", core.state.poll_in_flight == true)
check("c1: queue NOT drained before callback", #core.state.event_queue == 3)
-- fire success callback
captured_cb("{}", true, 200)
check("c1: in_flight cleared after callback", core.state.poll_in_flight == false)
check("c1: queue drained after success", #core.state.event_queue == 0)
check("c1: connected=true", core.state.connected == true)

-- ── Case 2: failed POST holds events for retry (NO loss) ────────────────────
core.state.event_queue = { { type = "x", id = 10 }, { type = "y", id = 11 } }
runPoll()
check("c2: queue intact before callback", #core.state.event_queue == 2)
captured_cb(nil, false, 0)  -- connection failure
check("c2: in_flight cleared on failure", core.state.poll_in_flight == false)
check("c2: events HELD on failure (no loss)", #core.state.event_queue == 2)
check("c2: connected=false", core.state.connected == false)
check("c2: connection_errors incremented", core.state.connection_errors == 1)

-- retry succeeds → now they drain
runPoll()
captured_cb("{}", true, 200)
check("c2: events drained on retry success", #core.state.event_queue == 0)

-- ── Case 3: drain is BY IDENTITY (new events during round-trip survive) ─────
core.state.event_queue = { { type = "p", id = 20 }, { type = "q", id = 21 } }
runPoll()  -- copies p,q; in flight
-- two new events arrive mid-flight (appended)
core.state.event_queue[#core.state.event_queue+1] = { type = "r", id = 22 }
core.state.event_queue[#core.state.event_queue+1] = { type = "s", id = 23 }
captured_cb("{}", true, 200)  -- success: should drain ONLY p,q
check("c3: only sent events drained, new ones kept", #core.state.event_queue == 2)
check("c3: kept events are r,s", core.state.event_queue[1].id == 22 and core.state.event_queue[2].id == 23)

-- ── Case 4: in-flight guard blocks a concurrent poll ────────────────────────
core.state.event_queue = { { type = "z", id = 30 } }
query_calls = 0
runPoll()                 -- starts a poll, in_flight=true, query_calls=1
local saved_cb = captured_cb
runPoll()                 -- should be blocked by the guard → no new QueryServer
check("c4: concurrent poll blocked by in-flight guard", query_calls == 1)
saved_cb("{}", true, 200) -- release
check("c4: queue drained after release", #core.state.event_queue == 0)

if #results == 0 then return "OK" else return "FAIL: " .. table.concat(results, "; ") end
