-- flow_brain.lua — a mob brain driven by DATA the flow sets (mechanic module).
--
-- The behaviour tree itself (brains/dstp_flowbrain.lua) runs every frame on the server,
-- like any Klei brain. The FLOW never runs per frame: it writes a small state table on
-- the entity (`inst._dstp_brain`) through the `entity_set_brain` command and the brain
-- reads it through the accessors below. Modes:
--   follow  — stay near a player (target = userid) or an entity (target = guid)
--   guard   — hold a point (x,z), attack what enters `radius`, leash back
--   attack  — hunt targets matching `tags`/`prefabs` (or players if attack_players)
--   flee    — run from players / `tags` within `radius`
--   wander  — roam around (x,z) within `radius`
--   stay    — stand still
--   default — restore the prefab's original brain
-- This file holds everything that is a DECISION (normalising the spec, resolving the
-- leader/anchor, the retarget predicate) as pure-ish functions so fengari can test them;
-- the brain file only wires Klei nodes to these.

local M = {}
local _G, Core
local BRAIN_FILE = "brains/dstp_flowbrain"

local MODES = { follow = true, guard = true, attack = true, flee = true, wander = true, stay = true, default = true }

local function list(v)
    if type(v) == "table" then return v end
    if type(v) ~= "string" or v == "" then return nil end
    local out = {}
    for tok in v:gmatch("[^,%s]+") do out[#out + 1] = tok end
    return #out > 0 and out or nil
end
local function truthy(v) return v == true or v == "true" or v == 1 or v == "1" end

--- Validate + normalise the spec the flow sent. Returns state or nil, reason.
function M.Normalize(spec)
    if type(spec) ~= "table" then return nil, "bad_spec" end
    local mode = tostring(spec.mode or ""):lower()
    if not MODES[mode] then return nil, "bad_mode" end
    local st = { mode = mode }
    -- target: a player userid ("KU_...") or an entity guid (number / numeric string)
    if spec.target ~= nil and spec.target ~= "" then
        local n = tonumber(spec.target)
        if n then st.target_guid = n else st.target_userid = tostring(spec.target) end
    end
    if spec.target_userid then st.target_userid = tostring(spec.target_userid) end
    if tonumber(spec.target_guid) then st.target_guid = tonumber(spec.target_guid) end
    st.x, st.z = tonumber(spec.anchor_x or spec.x), tonumber(spec.anchor_z or spec.z)
    st.radius = tonumber(spec.brain_radius or spec.radius) or 12
    st.tags = list(spec.tags)
    st.prefabs = list(spec.prefabs)
    st.attack_players = truthy(spec.attack_players)
    st.follow_min = tonumber(spec.follow_min) or 2
    st.follow_dist = tonumber(spec.follow_dist) or 4
    st.follow_max = tonumber(spec.follow_max) or 6   -- start following at 6 (Klei-style 10-12 felt like "does not follow")
    if (mode == "follow") and not (st.target_userid or st.target_guid) then return nil, "follow_needs_target" end
    if (mode == "guard" or mode == "wander") and not (st.x and st.z) then return nil, "needs_anchor" end
    return st
end

function M.GetState(inst) return inst and inst._dstp_brain or nil end

--- The entity to follow (player by userid, or Ents[guid]); nil when gone.
function M.ResolveLeader(state)
    if not state then return nil end
    if state.target_userid and Core and Core.FindPlayer then
        local p = Core.FindPlayer(state.target_userid)
        if p and p:IsValid() then return p end
    end
    if state.target_guid and _G and _G.Ents then
        local e = _G.Ents[state.target_guid]
        if e and e:IsValid() then return e end
    end
    return nil
end

--- The point the mob is anchored to (guard/wander); a Vector3-like table {x,y,z}.
function M.ResolveAnchor(inst, state)
    if state and state.x and state.z then return { x = state.x, y = 0, z = state.z } end
    if inst and inst.Transform then
        local x, y, z = inst.Transform:GetWorldPosition()
        return { x = x, y = y, z = z }
    end
    return nil
end

--- Should `inst` (in its current state) attack `ent`? Pure: no engine calls beyond
--- tags/prefab/player-ness on `ent`. The leader is never a target.
function M.ShouldTarget(inst, ent, state, leader)
    if not (ent and state) or ent == inst or ent == leader then return false end
    if ent.IsValid and not ent:IsValid() then return false end
    if state.mode ~= "attack" and state.mode ~= "guard" then return false end
    if ent.isplayer or (ent.HasTag and ent:HasTag("player")) then return state.attack_players == true end
    if state.tags then
        for _, t in ipairs(state.tags) do if ent.HasTag and ent:HasTag(t) then return true end end
    end
    if state.prefabs then
        for _, p in ipairs(state.prefabs) do if ent.prefab == p then return true end end
    end
    return false
end

--- Retarget fn for Combat:SetRetargetFunction — scans `radius` around the mob (attack)
--- or around the anchor (guard) and returns the first entity ShouldTarget accepts.
function M.FindTarget(inst, state)
    if not (inst and state and _G and _G.TheSim) then return nil end
    local cx, cz
    if state.mode == "guard" then
        local a = M.ResolveAnchor(inst, state); cx, cz = a.x, a.z
    else
        local x, _, z = inst.Transform:GetWorldPosition(); cx, cz = x, z
    end
    local leader = M.ResolveLeader(state)
    local ents = _G.TheSim:FindEntities(cx, 0, cz, state.radius, nil, { "INLIMBO", "notarget" }, nil) or {}
    for _, e in ipairs(ents) do
        if M.ShouldTarget(inst, e, state, leader) then return e end
    end
    return nil
end

-- ── Events back to the flow ─────────────────────────────────────────────────
-- Every event carries { guid, prefab, mode } + specifics. Pushed through Core.PushEvent
-- (the normal event queue → next sync), only for flow-brained mobs, so no category gate.
local function Base(inst)
    local st = inst._dstp_brain or {}
    return { guid = inst.GUID, prefab = inst.prefab, mode = st.mode }
end
local function Describe(ent)
    if not ent then return nil, nil, nil end
    return ent.GUID, ent.prefab, ent.userid
end
local function Push(inst, typ, extra)
    if not (Core and Core.PushEvent) then return end
    local d = Base(inst)
    for k, v in pairs(extra or {}) do d[k] = v end
    Core.PushEvent(typ, d)
end

--- Periodic monitor (0.5 s): edge-triggered `brain_arrived` (follow: within follow_dist
--- of the leader) and `brain_leader_lost` (follow: leader gone). Edge = fires once per
--- transition, so a mob standing next to its leader does not spam the flow.
function M.Monitor(inst)
    local st = inst and inst._dstp_brain
    if not st then return end
    local mon = inst._dstp_brain_mon or {}
    inst._dstp_brain_mon = mon
    if st.mode ~= "follow" then mon.arrived, mon.leader_lost = nil, nil return end
    local leader = M.ResolveLeader(st)
    if not leader then
        if not mon.leader_lost then
            mon.leader_lost = true
            Push(inst, "brain_leader_lost", { target_userid = st.target_userid, target_guid = st.target_guid })
        end
        mon.arrived = nil
        return
    end
    mon.leader_lost = nil
    local x, _, z = inst.Transform:GetWorldPosition()
    local lx, _, lz = leader.Transform:GetWorldPosition()
    local near = ((x - lx) ^ 2 + (z - lz) ^ 2) <= (st.follow_dist or 4) ^ 2
    if near and not mon.arrived then
        mon.arrived = true
        local g, p, u = Describe(leader)
        Push(inst, "brain_arrived", { target_guid = g, target_prefab = p, target_userid = u })
    elseif not near and mon.arrived and ((x - lx) ^ 2 + (z - lz) ^ 2) > ((st.follow_max or 10) ^ 2) then
        mon.arrived = nil   -- re-arm once the leader got far away again
    end
end

local function InstallHooks(inst)
    local hooks = {}
    hooks.newtarget = function(_, data)
        local g, p, u = Describe(data and data.target)
        Push(inst, "brain_target_acquired", { target_guid = g, target_prefab = p, target_userid = u })
    end
    hooks.dropped = function(_, data)
        local g, p, u = Describe(data and data.target)
        Push(inst, "brain_target_lost", { target_guid = g, target_prefab = p, target_userid = u })
    end
    hooks.death = function(_, data)
        local g, p, u = Describe(data and data.afflicter)
        Push(inst, "brain_dead", { killer_guid = g, killer_prefab = p, killer_userid = u })
    end
    inst:ListenForEvent("newcombattarget", hooks.newtarget)
    inst:ListenForEvent("droppedtarget", hooks.dropped)
    inst:ListenForEvent("death", hooks.death)
    if inst.DoPeriodicTask then hooks.task = inst:DoPeriodicTask(0.5, function() M.Monitor(inst) end) end
    return hooks
end

local function RemoveHooks(inst, hooks)
    if not hooks then return end
    if inst.RemoveEventCallback then
        inst:RemoveEventCallback("newcombattarget", hooks.newtarget)
        inst:RemoveEventCallback("droppedtarget", hooks.dropped)
        inst:RemoveEventCallback("death", hooks.death)
    end
    if hooks.task and hooks.task.Cancel then hooks.task:Cancel() end
    inst._dstp_brain_mon = nil
end

--- Apply a spec: store the state and (once) swap the brain + retarget fn, remembering
--- the originals so `default` restores the prefab's own behaviour.
function M.Apply(inst, spec)
    if not (inst and inst.IsValid and inst:IsValid()) then return false, "gone" end
    local st, reason = M.Normalize(spec)
    if not st then return false, reason end
    if st.mode == "default" then return M.Restore(inst) end
    inst._dstp_brain = st
    if not inst._dstp_brain_orig then
        local combat = inst.components and inst.components.combat
        inst._dstp_brain_orig = {
            brainfn = inst.brainfn,
            targetfn = combat and combat.targetfn or nil,
            retargetperiod = combat and combat.retargetperiod or nil,
        }
        if combat and combat.SetRetargetFunction then
            combat:SetRetargetFunction(1, function(i) return M.FindTarget(i, i._dstp_brain) end)
        end
        local ok, BrainClass = _G.pcall(_G.require, BRAIN_FILE)
        if ok and BrainClass then
            local okSet, err = _G.pcall(function() inst:SetBrain(function() return BrainClass(inst) end) end)
            if not okSet then
                if Core and Core.LogError then Core.LogError("flow_brain: SetBrain failed: " .. tostring(err)) end
                inst._dstp_brain_orig = nil
                return false, "setbrain_failed"
            end
        else
            -- always visible (not debug-gated): a missing/broken brain file is the one
            -- failure that leaves the mob silently idle
            if Core and Core.LogError then Core.LogError("flow_brain: cannot load " .. BRAIN_FILE .. ": " .. tostring(BrainClass)) end
            inst._dstp_brain_orig = nil
            return false, "brain_file"
        end
        inst._dstp_brain_orig.hooks = InstallHooks(inst)
    end
    inst._dstp_brain_mon = nil   -- a mode change re-arms the edge-triggered events
    -- a fresh target scan on every mode change (drop a target the new mode forbids)
    local combat = inst.components and inst.components.combat
    if combat and combat.target and not M.ShouldTarget(inst, combat.target, st, M.ResolveLeader(st)) then
        combat:SetTarget(nil)
    end
    if inst.brain and inst.brain.bt and inst.brain.bt.Reset then inst.brain.bt:Reset() end
    return true
end

--- Put the prefab's own brain + retarget back.
function M.Restore(inst)
    if not (inst and inst._dstp_brain_orig) then return false, "not_flow_brained" end
    local o = inst._dstp_brain_orig
    local combat = inst.components and inst.components.combat
    if combat and combat.SetRetargetFunction then
        if o.targetfn then combat:SetRetargetFunction(o.retargetperiod or 3, o.targetfn)
        else combat.targetfn = nil; if combat.retargettask then combat.retargettask:Cancel(); combat.retargettask = nil end end
    end
    RemoveHooks(inst, o.hooks)
    inst:SetBrain(o.brainfn)
    inst._dstp_brain, inst._dstp_brain_orig = nil, nil
    return true
end

function M.Init(env)
    _G = env.GLOBAL
    Core = env.core
    return M
end

return M
