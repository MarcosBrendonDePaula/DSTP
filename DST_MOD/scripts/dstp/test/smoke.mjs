// Lua runtime smoke test for the DSTP mod modules, run via fengari (a Lua VM in
// JS) — no DST needed. Loads core + client with a mocked DST GLOBAL and exercises
// the boot path (DSTP.Init), proving the modularization loads and the public API +
// command registration still work. Run: bun DST_MOD/scripts/dstp/test/smoke.mjs
// (from the repo root). This catches runtime reference breaks that luaparse can't.
import { lua, lauxlib, lualib, to_luastring } from 'fengari'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const dstp = (f) => fs.readFileSync(path.join(ROOT, 'DST_MOD/scripts/dstp', f), 'utf8')

const L = lauxlib.luaL_newstate()
lualib.luaL_openlibs(L)
const D = (s, name) => {
  if (lauxlib.luaL_dostring(L, to_luastring(s)) !== lua.LUA_OK) {
    console.error(`✗ ${name || 'lua'}:`, lua.lua_tojsstring(L, -1)); process.exit(1)
  }
}

// A require shim serving the mod's submodules from disk (mapped from "dstp/x").
D(`_DSTP_MODULES = {}
   function require(name)
     if _DSTP_MODULES[name] then return _DSTP_MODULES[name] end
     error("unexpected require: "..tostring(name))
   end`, 'shim')

// Load the real submodules. Add new ones here as they're extracted.
for (const mod of ['core']) {
  D(`_DSTP_MODULES["dstp/${mod}"] = (function()\n${dstp(`${mod}.lua`)}\nend)()`, `load ${mod}`)
}
// Stub land_claims (its own logic is tested elsewhere).
D(`_DSTP_MODULES["dstp/land_claims"] = { Init = function() return { IsProtected = function() return false end } end }`, 'stub land_claims')

// Load client.lua (the glue) and run the boot path.
D(`DSTP = (function()\n${dstp('client.lua')}\nend)()`, 'load client')

D(`
  local GLOBAL = {
    json = { encode=function() return "{}" end, decode=function() return {} end },
    GetTime = function() return 0 end,
    AllPlayers = {},
    TheWorld = { ismastersim=true, state={}, components={}, HasTag=function() return false end },
    TheNet = { GetClientTable=function() return {} end, GetServerName=function() return "s" end,
               GetServerMaxPlayers=function() return 6 end, IsDedicated=function() return true end },
    TheSim = { GetTimeScale=function() return 1 end, FindEntities=function() return {} end,
               QueryServer=function() end, GetPersistentString=function() end },
    require = function(n) return _DSTP_MODULES[n] or error("g.require "..n) end,
    Networking_Say = function() end,
  }
  local calls = {}
  local env = { GLOBAL = GLOBAL, AddPrefabPostInit = function(name, fn) calls["postinit_"..name] = fn end }
  DSTP.Init(env, { server_id="test", backend_url="http://x", debug_logs=false, events={ players=true, chat=true } })

  local Core = _DSTP_MODULES["dstp/core"]
  assert(type(DSTP)=="table" and type(DSTP.Init)=="function", "DSTP public API broken")
  assert(type(DSTP.PushEvent)=="function" and type(DSTP.RegisterCommand)=="function", "DSTP aliases broken")
  assert(Core._G ~= nil and Core.json ~= nil, "core globals not injected")
  assert(Core.config.server_id == "test", "config not propagated")
  assert(Core.evt_config.players == true, "evt_config not set")
  assert(Core.command_handlers["heal"] and Core.command_handlers["announce"], "commands not registered")
  assert(calls["postinit_world"] ~= nil, "world postinit not registered")
  print("✓ smoke: client loads, DSTP.Init runs, core populated, commands registered, API intact")
`, 'boot')
