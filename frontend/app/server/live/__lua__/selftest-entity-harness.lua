-- Meta-test for the selftest.lua ENTITY CONTROL case (#57-59) on its LIVE path.
-- The plain selftest-harness has no engine, so testEntityControl skips. Here we inject
-- a minimal fake engine (SpawnPrefab building entities with real-ish components +
-- an Ents table the resolver reads) so the case runs its REAL assertions and cleanup,
-- and we verify it reports zero failures and leaves no spawned entity behind.
-- Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

-- ── A fake DST world: Ents[guid] + SpawnPrefab making component-bearing entities ──
local ENTS = {}
local next_guid = 1000
-- Per-prefab component templates (only what the self-test reads/mutates).
local function makeComponents(prefab)
    local c = {}
    if prefab == "pigman" or prefab == "rabbit" then
        local hp = 100
        c.health = {
            currenthealth = hp, maxhealth = hp, _dead = false,
            GetPercent = function(self) return self.currenthealth / self.maxhealth end,
            SetPercent = function(self, p) self.currenthealth = p * self.maxhealth end,
            DoDelta = function(self, d) self.currenthealth = self.currenthealth + d end,
            IsDead = function(self) return self._dead end,
            ForceKill = function(self) self._dead = true; self.currenthealth = 0 end,
            Kill = function(self) self._dead = true end,
        }
    end
    if prefab == "pigman" then
        c.freezable = {
            _frozen = false,
            IsFrozen = function(self) return self._frozen end,
            AddColdness = function(self, n) if (n or 0) >= 1 then self._frozen = true end end,
            Unfreeze = function(self) self._frozen = false end,
        }
    end
    if prefab == "campfire" then
        c.fueled = {
            _pct = 0.2,
            GetPercent = function(self) return self._pct end,
            SetPercent = function(self, p) self._pct = p end,
            DoDelta = function(self, d) self._pct = self._pct + d end,
            GetCurrentSection = function() return 1 end,
        }
    end
    if prefab == "evergreen" then
        c.burnable = {
            _burning = false,
            IsBurning = function(self) return self._burning end,
            IsSmoldering = function() return false end,
            Ignite = function(self) self._burning = true end,
            Extinguish = function(self) self._burning = false end,
        }
    end
    return c
end

local function SpawnPrefab(prefab)
    next_guid = next_guid + 1
    local guid = next_guid
    local valid = true
    local e
    e = {
        GUID = guid, prefab = prefab, components = makeComponents(prefab),
        Transform = {
            GetWorldPosition = function() return 0, 0, 0 end,
            SetPosition = function() end,
        },
        IsValid = function() return valid end,
        GetTimeAlive = function() return 1 end,
        IsAsleep = function() return false end,
        GetDisplayName = function() return prefab end,
        Remove = function(self) valid = false; ENTS[self.GUID] = nil end,
    }
    ENTS[guid] = e
    return e
end

local mock_G = KIT.make_G({ AllPlayers = {}, Ents = ENTS, SpawnPrefab = SpawnPrefab })

local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(mock_G, KIT.fake_json, { server_id = "s", max_batch_size = 50 })
Core.LogInfo = function() end
local Commands = KIT.load(MOD_COMMANDS, "commands.lua")
Commands.RegisterAll(Core)
local SelfTest = KIT.load(MOD_SELFTEST, "selftest.lua")
SelfTest.Init(Core)

local ents_before = 0
for _ in pairs(ENTS) do ents_before = ents_before + 1 end
local queue_before = #Core.state.event_queue

local run = SelfTest.Run()

-- The whole self-test (all 5 cases) must pass on the live path — in particular the
-- entity case now runs its real assertions instead of skipping.
check("selftest ran the full set", run ~= nil and (run.passed + run.failed) >= 12)
check("selftest: zero failures on the live entity path", run ~= nil and run.failed == 0)

-- The entity case must clean up after itself: no leftover spawned entities, queue intact.
local ents_after = 0
for _ in pairs(ENTS) do ents_after = ents_after + 1 end
check("entity case left no spawned entities behind", ents_after == ents_before)
check("entity case left the event queue as found", #Core.state.event_queue == queue_before)

return C.report()
