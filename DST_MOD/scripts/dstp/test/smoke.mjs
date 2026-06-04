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
// ORDER MATTERS: events.lua (the facade) require()s every events/<cat> at module top
// (eager), so all 14 events/* entries MUST load BEFORE 'events' or the require shim
// throws "unexpected require". The dstp() helper resolves 'events/players.lua' on disk
// and the key becomes "dstp/events/players" — exactly what the facade looks up.
for (const mod of [
  'core', 'collectors', 'commands',
  // events submodules (must precede the 'events' facade):
  'events/players', 'events/combat', 'events/crafting', 'events/inventory', 'events/health',
  'events/survival', 'events/gathering', 'events/exploration', 'events/griefing', 'events/character',
  'events/world', 'events/weather', 'events/boss', 'events/grief_world', 'events/nonplayer',
  'events',  // facade — requires all of the above
  'chat', 'http',
]) {
  D(`_DSTP_MODULES["dstp/${mod}"] = (function()\n${dstp(`${mod}.lua`)}\nend)()`, `load ${mod}`)
}
// Stub land_claims (its own logic is tested elsewhere).
D(`_DSTP_MODULES["dstp/land_claims"] = { Init = function() return {
     IsProtected=function() return false end, List=function() return {} end,
     Add=function() end, Remove=function() end, Trust=function() end, OwnerAt=function() return nil end,
   } end }`, 'stub land_claims')

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
    pcall = pcall, error = error, tonumber = tonumber, unpack = unpack,
  }
  local calls = {}
  local env = { GLOBAL = GLOBAL, AddPrefabPostInit = function(name, fn) calls["postinit_"..name] = fn end }
  DSTP.Init(env, { server_id="test", backend_url="http://x", debug_logs=false, events={ players=true, world=true, chat=true } })

  -- Fire the world postinit → RegisterGameEvents → many inst:ListenForEvent calls.
  local listeners = {}
  -- A fake already-connected player so RegisterGameEvents' AllPlayers loop exercises
  -- the per-player fan-out (each events/<cat>.RegisterForPlayer). Captures into pl[].
  local pl = {}
  GLOBAL.AllPlayers = { {
    userid = "KU_player1", name = "Tester", prefab = "wilson",
    IsValid = function() return true end,
    HasTag = function() return false end,
    ListenForEvent = function(_, ev) pl[ev] = true end,
  } }
  GLOBAL.TheWorld.meta = { session_identifier = "SESSIONID1234" }
  local _ran0 = false
  local worldInst = {
    ismastersim = true, state = { cycles = 1, season = "autumn", phase = "day" }, components = {},
    HasTag = function() return false end,
    ListenForEvent = function(_, ev) listeners[ev] = true end,
    -- run a DoTaskInTime(0) callback immediately (simulate the 1-frame defer); but
    -- only the FIRST level (the poll scheduler re-arms itself → would recurse).
    DoTaskInTime = function(_, t, fn) if t == 0 and not _ran0 then _ran0 = true; if fn then fn() end end end,
    AddComponent = function() end,
    DoPeriodicTask = function() end,
  }
  GLOBAL.TheWorld = worldInst  -- the deferred init reads _G.TheWorld.meta
  worldInst.meta = { session_identifier = "SESSIONID1234" }
  assert(calls["postinit_world"], "no world postinit")
  calls["postinit_world"](worldInst)
  assert(listeners["ms_cyclecomplete"], "new_day listener not registered")
  assert(listeners["phasechanged"], "phase_changed listener (the #1 fix) not registered")
  assert(listeners["seasontick"], "season_changed listener not registered")
  assert(worldInst == _DSTP_MODULES["dstp/core"].world_inst, "core.world_inst not shared")
  -- per-player fan-out wired: each events/<cat>.RegisterForPlayer ran for the fake player
  assert(pl["killed"], "combat per-player listener not registered (events/combat fan-out)")
  assert(pl["healthdelta"], "health per-player listener not registered (events/health fan-out)")
  assert(pl["equip"], "inventory per-player listener not registered (events/inventory fan-out)")
  assert(pl["oneat"], "survival per-player listener not registered (events/survival fan-out)")
  assert(pl["gotosleep"], "character per-player listener not registered (events/character fan-out)")
  assert(pl["onhammer"], "griefing per-player listener not registered (events/griefing fan-out)")
  -- new audit events (#8-14) wired on the player:
  assert(pl["blocked"], "player_block listener not registered")
  assert(pl["onmissother"], "player_attack_miss listener not registered")
  assert(pl["epicscare"], "boss_warning listener not registered")
  assert(pl["inventoryfull"], "inventory_full listener not registered")
  assert(pl["unlockrecipe"], "recipe_unlocked listener not registered")
  assert(pl["techtreechange"], "tech_tree_changed listener not registered")
  assert(pl["goenlightened"], "player_enlightened listener not registered")
  assert(pl["sanitymodechanged"], "player_lunacy_normal listener not registered")
  assert(pl["moisturedelta"], "player_wet listener not registered")
  assert(pl["picksomething"], "player_pick listener not registered")
  assert(pl["working"], "player_mine_chop_start listener not registered")
  assert(pl["respawnfromcorpse"] or pl["ms_respawnedfromghost"], "player_resurrected listener not registered")
  assert(pl["minhealth"], "player_min_health listener not registered")
  -- new world events:
  assert(listeners["ms_riftaddedtopool"], "rift_spawned world listener not registered")
  assert(listeners["ms_newplayercharacterspawned"], "player_new_character world listener not registered")
  assert(listeners["ms_playerdespawnandmigrate"], "player_migrated world listener not registered")

  -- non-player component hooks (combat/trader) — exercised directly (modmain's
  -- AddComponentPostInit isn't run here). Each fakes a mob/NPC inst + a player target.
  local Core2 = _DSTP_MODULES["dstp/core"]
  assert(type(Core2.HookCombatComponent)=="function", "HookCombatComponent not published on core")
  assert(type(Core2.HookTraderComponent)=="function", "HookTraderComponent not published on core")
  local mobListeners = {}
  local fakeMob = { inst = { prefab="hound", GUID=99,
    HasTag = function(_, t) return false end,
    ListenForEvent = function(_, ev) mobListeners[ev] = true end } }
  Core2.HookCombatComponent(fakeMob)
  assert(mobListeners["newcombattarget"], "player_combat_target hook didn't attach newcombattarget")
  local npcListeners = {}
  local fakeNpc = { inst = { prefab="pigking", GUID=100,
    HasTag = function() return false end,
    ListenForEvent = function(_, ev) npcListeners[ev] = true end } }
  Core2.HookTraderComponent(fakeNpc)
  assert(npcListeners["trade"], "trade_received hook didn't attach trade")

  local Core = _DSTP_MODULES["dstp/core"]
  assert(type(DSTP)=="table" and type(DSTP.Init)=="function", "DSTP public API broken")
  assert(type(DSTP.PushEvent)=="function" and type(DSTP.RegisterCommand)=="function", "DSTP aliases broken")
  assert(Core._G ~= nil and Core.json ~= nil, "core globals not injected")
  assert(Core.config.server_id == "test", "config not propagated")
  assert(Core.evt_config.players == true, "evt_config not set")
  assert(Core.command_handlers["heal"] and Core.command_handlers["announce"], "commands not registered")
  assert(calls["postinit_world"] ~= nil, "world postinit not registered")
  -- collectors wired and runnable
  local Collectors = _DSTP_MODULES["dstp/collectors"]
  assert(Collectors and type(Collectors.GetServerInfo)=="function", "collectors not loaded")
  local info = Collectors.GetServerInfo()
  assert(info.max_players == 6 and type(info.uptime)=="number", "GetServerInfo wrong: "..tostring(info.max_players))
  assert(type(Collectors.GetAllPlayersData()) == "table", "GetAllPlayersData not table")
  -- commands count sanity + a handler actually runs (announce hits TheNet:Announce)
  local ncmds = 0; for _ in pairs(Core.command_handlers) do ncmds = ncmds + 1 end
  assert(ncmds >= 50, "expected ~55 commands, got "..ncmds)
  local announced = false
  GLOBAL.TheNet.Announce = function(_, msg) announced = (msg == "hi") end
  Core.command_handlers["announce"]({ message = "hi" })
  assert(announced, "announce handler did not run")
  -- a claim command runs without error (LandClaims is the stub)
  Core.command_handlers["claim_list"]({ token = "t" })
  print("✓ smoke: client loads, Init runs, "..ncmds.." commands registered+runnable, collectors run, API intact")
`, 'boot')
