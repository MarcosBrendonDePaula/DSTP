-- Harness for SafeSpawn (commands.lua): a non-spawnable prefab (no .fn in the
-- Prefabs table) must NOT reach _G.SpawnPrefab — that's the engine crash we hit
-- when autocomplete offered a placeholder prefab (backpack_bat). Loads real
-- core.lua + commands.lua with a controlled Prefabs table + a spy SpawnPrefab.

local C = KIT.new_checker()

-- Only "spear" and "log" are real (have fn); "backpack_bat" is a placeholder (no fn).
local PREFABS = {
  spear = { fn = function() end },
  log   = { fn = function() end },
  backpack_bat = { },        -- registered but NOT spawnable (fn = nil)
}

local spawned = {}            -- names actually passed to _G.SpawnPrefab
local function mkEntity(name)
  return {
    prefab = name,
    Transform = { GetWorldPosition = function() return 0, 0, 0 end, SetPosition = function() end },
    components = {},
  }
end

local mock_G = KIT.make_G({
  Prefabs = PREFABS,
  AllPlayers = { { userid = "KU_1", name = "Bob", prefab = "wilson",
    Transform = { GetWorldPosition = function() return 5, 0, 7 end },
    components = { inventory = { GiveItem = function() end } } } },
  SpawnPrefab = function(name) spawned[#spawned + 1] = name; return mkEntity(name) end,
})

local Core = KIT.load(MOD_CORE, "core")
Core.Init(mock_G, KIT.fake_json, { server_id = "s" })
local Commands = KIT.load(MOD_COMMANDS, "commands")
Commands.RegisterAll(Core)

-- FindPlayer needs the client table; core resolves by userid against AllPlayers.
-- (commands use core.FindPlayer; make sure it returns our fake player.)
Core.FindPlayer = function(uid) return mock_G.AllPlayers[1] end

-- 1) Spawn a REAL prefab → reaches SpawnPrefab.
spawned = {}
Core.ExecuteCommand({ type = "spawn_at_player", data = { userid = "KU_1", prefab = "spear", count = 1 } })
C.check("real prefab 'spear' was spawned", #spawned == 1 and spawned[1] == "spear")

-- 2) Spawn a NON-spawnable prefab → SafeSpawn rejects, SpawnPrefab NEVER called.
spawned = {}
Core.ExecuteCommand({ type = "spawn_at_player", data = { userid = "KU_1", prefab = "backpack_bat", count = 1 } })
C.check("placeholder 'backpack_bat' did NOT reach SpawnPrefab (no crash)", #spawned == 0)

-- 3) Unknown prefab (not in table at all) → also rejected.
spawned = {}
Core.ExecuteCommand({ type = "spawn_at_player", data = { userid = "KU_1", prefab = "does_not_exist", count = 1 } })
C.check("unknown prefab rejected", #spawned == 0)

-- 4) give_item with a real prefab still works (same SafeSpawn path).
spawned = {}
Core.ExecuteCommand({ type = "give_item", data = { userid = "KU_1", prefab = "log", count = 1 } })
C.check("give_item real prefab spawned", #spawned == 1 and spawned[1] == "log")

return C.report()
