-- DSTP Events / interaction — EVERY action a player performs on the world, as one
-- generic event. The server sees each interaction as a BufferedAction and the player
-- emits `performaction` when it runs (and `actionfailed` when TestForStart rejects it):
-- LOOK (examine = the right-click default), PICKUP, ATTACK, OPEN, HARVEST, CHOP, MINE,
-- GIVE, EAT, EQUIP, DEPLOY, BUILD, ... — the action id is `ACTIONS.<ID>.id`.
--
-- This is how a flow learns "the player clicked THAT entity": `player_action { userid,
-- action, guid, prefab, x, z, item, item_guid, recipe }` carries the SERVER guid (what
-- get_entity / entity_brain resolve). No client Lua, no mouse traffic.
--
-- WALKTO with no target (a click on the ground) is dropped — it is the one action that
-- fires on every ground click and says nothing about an entity. A WALKTO on a target
-- (click on something with no other action) IS reported.
-- Registered via M.RegisterForPlayer(player,uid,pname); gates on evt_config.interaction.

local M = {}

local core, _G, evt_config, DSTP

function M.Init(c)
    core = c
    _G = c._G
    evt_config = c.evt_config
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    return M
end

-- Flatten a BufferedAction into the event payload (pure; exported for the harness).
function M.Describe(ba)
    if type(ba) ~= "table" then return nil end
    local act = ba.action
    local id = type(act) == "table" and (act.id or act.str) or act
    if id == nil then return nil end
    local d = { action = tostring(id) }
    local t = ba.target
    if type(t) == "table" then
        d.guid, d.prefab = t.GUID, t.prefab
        if t.Transform and t.Transform.GetWorldPosition then
            local x, _, z = t.Transform:GetWorldPosition()
            d.x, d.z = x and math.floor(x + 0.5) or nil, z and math.floor(z + 0.5) or nil
        end
        if t.userid then d.target_userid = t.userid end
    end
    if d.x == nil and ba.pos ~= nil then
        local p = ba.pos
        if type(p) == "table" and p.GetPosition then p = p:GetPosition() end
        if type(p) == "table" and p.x then d.x, d.z = math.floor(p.x + 0.5), math.floor(p.z + 0.5) end
    end
    local inv = ba.invobject
    if type(inv) == "table" then d.item, d.item_guid = inv.prefab, inv.GUID end
    if ba.recipe ~= nil then d.recipe = tostring(ba.recipe) end
    return d
end

function M.RegisterForPlayer(player, uid, pname)
    player:ListenForEvent("performaction", function(inst, data)
        if not evt_config.interaction then return end
        local d = M.Describe(data and data.action)
        if not d then return end
        if d.action == "WALKTO" and d.guid == nil then return end   -- ground click: noise
        d.userid, d.name = uid, pname
        DSTP.PushEvent("player_action", d, data)
    end)
    player:ListenForEvent("actionfailed", function(inst, data)
        if not evt_config.interaction then return end
        local d = M.Describe(data and data.action)
        if not d then return end
        d.userid, d.name = uid, pname
        d.reason = data.reason ~= nil and tostring(data.reason) or nil
        DSTP.PushEvent("player_action_failed", d, data)
    end)
end

return M
