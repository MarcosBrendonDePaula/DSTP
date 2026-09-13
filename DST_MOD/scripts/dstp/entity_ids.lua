-- entity_ids.lua — a STABLE id per entity (mechanic module).
--
-- DST's GUID is reassigned on every world load, so a flow cannot remember an entity by
-- guid across a restart (in-game 2026-09-13: the pet's remembered guid pointed at a
-- different entity after a load). This module gives an entity a `dstp_id` that is saved
-- WITH the entity (components/dstp_id.lua, add_component_if_missing) and re-indexed on
-- load, so `id` works as a resolver key forever. Ids are assigned lazily: on spawn with a
-- token, when a flow brain is applied, when a flow asks (entity_tag_id) — never on every
-- entity in the world.
local M = {}
local _G
local index = {}       -- id → inst (live only)
local counter = 0

function M.Init(env)
    _G = env.GLOBAL
    return M
end

local function NewId()
    counter = counter + 1
    local t = (_G and _G.os and _G.os.time and _G.os.time()) or 0
    local r = math.random(0, 0x7fffffff)
    return string.format("e%x%x%x", t, r, counter)
end

--- Register a live entity under an id (called by the component on load / assign).
function M.Register(id, inst)
    if not (id and inst) then return end
    index[id] = inst
    if inst.ListenForEvent and not inst._dstp_id_hooked then
        inst._dstp_id_hooked = true
        inst:ListenForEvent("onremove", function() if index[id] == inst then index[id] = nil end end)
    end
end

--- The live entity for an id (nil when unknown or gone).
function M.Get(id)
    local inst = id and index[id] or nil
    if inst and inst.IsValid and not inst:IsValid() then index[id] = nil; return nil end
    return inst
end

--- The entity's stable id, or nil if it has none yet.
function M.IdOf(inst)
    local c = inst and inst.components and inst.components.dstp_id
    return c and c.id or nil
end

--- Give the entity a stable id if it has none. Returns the id (nil if it cannot: no
--- components table = not a server entity).
function M.Ensure(inst)
    if not (inst and inst.components) then return nil end
    local c = inst.components.dstp_id
    if not c and inst.AddComponent then
        local ok = _G and _G.pcall and _G.pcall(function() inst:AddComponent("dstp_id") end)
        if ok == false then return nil end
        c = inst.components.dstp_id
    end
    if not c then return nil end
    if not c.id then
        c.id = NewId()
    end
    M.Register(c.id, inst)
    return c.id
end

--- For tests / diagnostics.
function M.Count()
    local n = 0
    for _ in pairs(index) do n = n + 1 end
    return n
end

return M
