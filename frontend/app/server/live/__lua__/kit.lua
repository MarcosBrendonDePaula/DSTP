-- DSTP mod test kit (Lua side). Prepended before each harness by mod-test-kit.ts.
-- Provides the shared boilerplate for running REAL mod modules under fengari:
--   * KIT.make_G{}      — a mock DST `_G` (GetTime, TheWorld, TheNet, TheSim, ...)
--   * KIT.load(src,name)— load a mod module's source and return its module table
--   * KIT.check / KIT.report — tiny assertion collector returning "OK"/"FAIL: ..."
--   * KIT.fake_json     — a pass-through json lib (encode->marker, decode->fixed)
-- Module sources are injected by the JS runner as globals MOD_<NAME> (e.g. MOD_CORE).

local KIT = {}

-- Lua 5.1 compat shims. DST runs Lua 5.1 (loadstring/setfenv/unpack are globals);
-- fengari is Lua 5.3 (they were removed). Mod code that targets 5.1 (e.g. the
-- `execute` command: loadstring + setfenv) would fail under the test runner without
-- these. We install them as GLOBALS so mod code calling them bare works, and also
-- mirror them onto the mock _G in make_G.
if loadstring == nil and load ~= nil then loadstring = load end
if unpack == nil and table and table.unpack then unpack = table.unpack end
if setfenv == nil and debug and debug.setupvalue and debug.getupvalue then
  -- 5.3 has no setfenv; emulate by rebinding the function's _ENV upvalue. _ENV is
  -- the upvalue named "_ENV"; find and set it. Good enough for "run this chunk with
  -- this environment table" (what the execute command needs).
  setfenv = function(fn, env)
    local i = 1
    while true do
      local name = debug.getupvalue(fn, i)
      if not name then break end
      if name == "_ENV" then debug.setupvalue(fn, i, env); return fn end
      i = i + 1
    end
    return fn
  end
end

-- Controllable clock. Tests set KIT.now and advance it to drive debounce/timeouts.
KIT.now = 1000
function KIT.advance(dt) KIT.now = KIT.now + dt end

-- A mock DST global table. Pass overrides to replace/extend specific fields.
function KIT.make_G(overrides)
  local G = {
    GetTime = function() return KIT.now end,
    TheWorld = { ismastersim = true, state = {} },
    TheNet = { GetClientTable = function() return {} end },
    TheSim = { QueryServer = function() end },
    AllPlayers = {},
    print = print,
    -- DST's real _G (GLOBAL) is the FULL Lua environment, so mod code reaches stock
    -- globals through _G (e.g. _G.debug.sethook, _G.coroutine, _G.error, loadstring,
    -- setfenv, unpack). Mirror them so guarded-Lua / execute behave as in-game.
    debug = debug,
    coroutine = coroutine,
    error = error,
    pcall = pcall,
    xpcall = xpcall,
    load = load,
    loadstring = loadstring,
    setfenv = setfenv,
    unpack = unpack,
    tostring = tostring,
    tonumber = tonumber,
    type = type,
    pairs = pairs,
    ipairs = ipairs,
    -- rawset/rawget/next: DST's real _G has them, and strict-mode-safe code (e.g. the
    -- self-test writing a sentinel into _G without tripping the strict metatable) calls
    -- rawset/rawget. Mirror them so that code behaves under fengari as in-game.
    rawset = rawset,
    rawget = rawget,
    rawequal = rawequal,
    next = next,
    math = math,
    string = string,
    table = table,
    -- Mock Prefabs registry: commands.lua's SafeSpawn validates Prefabs[name].fn
    -- before spawning (real prefabs have a constructor fn; placeholders don't). The
    -- metatable reports ANY name as spawnable so tests that mock SpawnPrefab work;
    -- a test can override G.Prefabs to simulate a non-spawnable prefab.
    Prefabs = setmetatable({}, { __index = function() return { fn = function() end } end }),
  }
  if overrides then for k, v in pairs(overrides) do G[k] = v end end
  -- Self-reference: DST's real _G has _G._G == _G, so code run with setfenv(fn, _G)
  -- (the `execute` command) can name `_G` inside the chunk (e.g. rawset(_G, k, v)).
  -- Set it last so an override can't accidentally drop it.
  G._G = G
  return G
end

-- Pass-through json: encode returns a marker, decode returns a caller-set table.
KIT.decode_result = { commands = {} }
KIT.fake_json = {
  encode = function(_) return "ENCODED" end,
  decode = function(_) return KIT.decode_result end,
}

-- Load a mod module from its injected source and return the module table.
function KIT.load(src, name)
  local chunk, err = load(src, name or "mod")
  if not chunk then error("load error in " .. tostring(name) .. ": " .. tostring(err)) end
  return chunk()
end

-- Assertion collector.
function KIT.new_checker()
  local fails = {}
  return {
    check = function(label, cond) if not cond then fails[#fails + 1] = label end end,
    report = function() if #fails == 0 then return "OK" else return "FAIL: " .. table.concat(fails, "; ") end end,
  }
end

return KIT
