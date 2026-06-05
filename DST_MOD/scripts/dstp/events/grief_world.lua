-- DSTP Events / grief_world — world-scoped anti-grief: structure_burnt detection
-- via entity_death + burnable check. Extracted from events.lua verbatim (was
-- RegisterGriefEvents). Registered via M.RegisterWorld(inst) by the events facade.
-- Gates on core.evt_config.griefing; emits via core.PushEvent (DSTP proxy).

local M = {}

local core, evt_config, DSTP

function M.Init(c)
    core = c
    evt_config = c.evt_config
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    return M
end

-- RegisterWorld is now a no-op: entity_death is dispatched centrally by the facade
-- (ONE world listener fanned out to each module's OnEntityDeath) — see events.lua.
function M.RegisterWorld(inst)
end

-- Central entity_death dispatch (called by the facade's single listener). Burnt structure.
function M.OnEntityDeath(world, data)
    if not evt_config.griefing then return end
    local ent = data and data.inst
    if not ent then return end
    -- Only report structures
    if not (ent:HasTag("structure") or (ent.components and ent.components.workable)) then return end
    -- Was it burnt?
    local was_burnt = ent.components and ent.components.burnable and ent.components.burnable.burning
    local is_fire_cause = data.cause == "fire"
        or (data.afflicter and data.afflicter.HasTag and data.afflicter:HasTag("fire"))
    if was_burnt or is_fire_cause then
        local x, _, z = 0, 0, 0
        if ent.Transform then x, _, z = ent.Transform:GetWorldPosition() end
        DSTP.PushEvent("structure_burnt", {
            prefab = ent.prefab or "unknown",
            cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "fire",
            x = math.floor(x),
            z = math.floor(z),
        }, data)
    end
end

return M
