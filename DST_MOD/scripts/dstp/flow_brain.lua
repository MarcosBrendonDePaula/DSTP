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
local Push   -- forward decl: defined in the events section, used by Collect above it

--   collect — pick up ground items within `radius` into the mob's own container
--             (`tags`/`prefabs` filter what); follows `target` when nothing to pick
local MODES = { follow = true, guard = true, attack = true, flee = true, wander = true, stay = true, default = true, collect = true }

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
    if mode == "collect" then
        st.radius = tonumber(spec.brain_radius or spec.radius) or 8
        -- store = "self" (default): stash into the mob's own container on arrival;
        --         "event": only report brain_item_reached — the FLOW decides what to do
        --         (entity_take_item / entity_drop_item / anything), policy stays in the flow
        st.store = (tostring(spec.store or ""):lower() == "event") and "event" or "self"
    end
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

-- ── collect: ground items → the mob's own container ─────────────────────────
--- Pure predicate: can `inst` pick `item` up right now under `state`?
function M.CanCollect(inst, item, state)
    if not (inst and item and state) or item == inst then return false end
    if item.IsValid and not item:IsValid() then return false end
    local ii = item.components and item.components.inventoryitem
    if not ii or ii.canbepickedup == false then return false end
    if ii.owner ~= nil or (ii.IsHeld and ii:IsHeld()) then return false end       -- someone holds it
    if item.components and item.components.burnable and item.components.burnable.IsBurning and item.components.burnable:IsBurning() then return false end
    -- NO capacity policy here (owner's rule: Lua = primitives, the flow decides). The mob
    -- walks to the item and TRIES; if it does not fit the flow hears
    -- brain_item_reached { reason } and decides (unload, drop, stop). The only guard is
    -- an anti-spam cooldown per item after a failed attempt (mechanism, not policy).
    local now = (_G and _G.GetTime and _G.GetTime()) or 0
    if item._dstp_skip_until and now < item._dstp_skip_until then return false end
    if state.tags then
        local ok = false
        for _, t in ipairs(state.tags) do if item.HasTag and item:HasTag(t) then ok = true break end end
        if not ok then return false end
    end
    if state.prefabs then
        local ok = false
        for _, p in ipairs(state.prefabs) do if item.prefab == p then ok = true break end end
        if not ok then return false end
    end
    return true
end

--- Nearest collectable ground item within `radius` (or nil). The radius is centred on
--- the LEADER when there is one (a pet gathers around its owner) — centred on the mob
--- it drifted away item by item (in-game 2026-09-12: "ele saiu de perto de mim").
function M.FindPickup(inst, state)
    if not (inst and state and _G and _G.TheSim and inst.Transform) then return nil end
    local centre = M.ResolveLeader(state) or inst
    local x, _, z = centre.Transform:GetWorldPosition()
    -- FindEntities returns nearest-first
    local ents = _G.TheSim:FindEntities(x, 0, z, state.radius or 12, { "_inventoryitem" }, { "INLIMBO", "NOCLICK", "fire", "heavy", "irreplaceable" }, nil) or {}
    for _, e in ipairs(ents) do
        if M.CanCollect(inst, e, state) then return e end
    end
    return nil
end

--- Capability query (a primitive for flows / commands): how many of `item` fit in
--- `inst`'s container/inventory right now (free slots + room in stacks). 0 = none.
function M.CanAccept(inst, item)
    local c = inst and inst.components and (inst.components.container or inst.components.inventory)
    if not (c and item) then return 0 end
    if c.CanAcceptCount then return c:CanAcceptCount(item) or 0 end
    if c.IsFull and c:IsFull() then return 0 end
    return 1
end

local function StackOf(item)
    if item.components and item.components.stackable and item.components.stackable.StackSize then return item.components.stackable:StackSize() end
    return 1
end

--- Generic: put `item` (a ground item, or one the mob already holds) into `inst`'s
--- container OR inventory — whichever it has. Any mob, any flow. Returns ok, reason.
function M.TakeItem(inst, item)
    if not (inst and item and item.IsValid and item:IsValid()) then return false, "gone" end
    local ii = item.components and item.components.inventoryitem
    if not ii then return false, "not_item" end
    local holder = inst.components and (inst.components.container or inst.components.inventory)
    if not holder then return false, "no_container" end
    if holder.IsFull and holder:IsFull() then return false, "full" end
    local ok = holder:GiveItem(item)
    if ok == false then return false, "refused" end
    return true
end

--- Generic: drop from `inst`'s container/inventory. `what` = a prefab name, an item
--- guid, or "all". Returns the number of items dropped.
function M.DropItem(inst, what)
    local holder = inst and inst.components and (inst.components.container or inst.components.inventory)
    if not holder then return 0 end
    if what == nil or what == "all" then
        if holder.DropEverything then holder:DropEverything() end
        return -1
    end
    local guid = tonumber(what)
    local item = holder.FindItem and holder:FindItem(function(it)
        return it and it:IsValid() and ((guid and it.GUID == guid) or it.prefab == what)
    end) or nil
    if not item then return 0 end
    if holder.DropItem then holder:DropItem(item, true) end
    return 1
end

--- Generic: spawn `prefab` ×count straight into `inst`'s container/inventory.
--- Returns the item (or nil, reason).
function M.GiveNewItem(inst, prefab, count)
    if not (inst and prefab and _G and _G.SpawnPrefab) then return nil, "bad_args" end
    local holder = inst.components and (inst.components.container or inst.components.inventory)
    if not holder then return nil, "no_container" end
    local item = _G.SpawnPrefab(prefab)
    if not item then return nil, "bad_prefab" end
    count = math.max(1, math.floor(tonumber(count) or 1))
    if count > 1 and item.components and item.components.stackable then item.components.stackable:SetStackSize(count) end
    local ok, why = M.TakeItem(inst, item)
    if not ok then if item.Remove then item:Remove() end return nil, why end
    return item
end

--- Generic: move `what` (prefab | item guid | "all") from `src`'s holder to `dst`'s,
--- never touching the ground; an item the target refuses goes back to the source.
--- Returns moved, refused.
function M.TransferItems(src, dst, what)
    local from = src and src.components and (src.components.container or src.components.inventory)
    local to = dst and dst.components and (dst.components.container or dst.components.inventory)
    if not (from and to) then return 0, 0 end
    local guid = tonumber(what)
    local matches = function(it)
        return it and it:IsValid() and (what == nil or what == "all" or (guid and it.GUID == guid) or it.prefab == what)
    end
    local items = {}
    if from.GetAllItems then
        for _, it in ipairs(from:GetAllItems()) do if matches(it) then items[#items + 1] = it end end
    elseif from.FindItem then
        local it = from:FindItem(matches); if it then items[1] = it end
    end
    local moved, refused = 0, 0
    for _, it in ipairs(items) do
        if what ~= "all" and what ~= nil and moved > 0 and not guid then break end   -- one stack per prefab call
        local taken = from.RemoveItem and from:RemoveItem(it, true) or it
        if taken and to:GiveItem(taken) ~= false then moved = moved + 1
        else refused = refused + 1; if taken then from:GiveItem(taken) end end
    end
    return moved, refused
end

-- ── one-shot TASKS: "go get THAT item" / "go to X,Z" — generic, any mode ────────
-- The flow issues a task (entity_collect / entity_goto); the brain runs it with top
-- priority, then falls back to the current mode. Outcome → brain_task_done
-- { kind, ok, reason, token, item, item_guid }. A task times out after `timeout` s
-- (default 20) via the monitor. Primitives, no policy: what to do next is the flow's.
function M.SetTask(inst, task)
    if not (inst and task and task.kind) then return false, "bad_task" end
    local st = inst._dstp_brain
    if not st then return false, "not_flow_brained" end
    local now = (_G and _G.GetTime and _G.GetTime()) or 0
    st.task = {
        kind = task.kind, token = task.token, store = task.store,
        item_guid = tonumber(task.item_guid), target_guid = tonumber(task.target_guid),
        x = tonumber(task.x), z = tonumber(task.z),
        deadline = now + (tonumber(task.timeout) or 20),
        started = now,
    }
    if inst.brain and inst.brain.bt and inst.brain.bt.Reset then inst.brain.bt:Reset() end
    return true
end

function M.GetTask(inst) return inst and inst._dstp_brain and inst._dstp_brain.task or nil end

function M.FinishTask(inst, ok, reason, extra)
    local st = inst and inst._dstp_brain
    local task = st and st.task
    if not task then return end
    st.task = nil
    local d = { kind = task.kind, ok = ok and true or false, reason = ok and nil or (reason or "failed"), token = task.token }
    for k, v in pairs(extra or {}) do d[k] = v end
    Push(inst, "brain_task_done", d)
end

--- The task's BufferedAction for the brain's DoAction (nil = no task / target gone).
function M.TaskAction(inst)
    local task = M.GetTask(inst)
    if not task then return nil end
    if task.kind == "pickup" then
        local item = task.item_guid and _G.Ents[task.item_guid] or nil
        if not (item and item:IsValid()) then M.FinishTask(inst, false, "gone") return nil end
        local ba = _G.BufferedAction(inst, item, _G.ACTIONS.WALKTO, nil, nil, nil, 1.5)
        ba:AddSuccessAction(function()
            if M.GetTask(inst) ~= task then return end
            if task.store == "event" then
                M.FinishTask(inst, true, nil, { item = item.prefab, item_guid = item.GUID, count = StackOf(item) })
                return
            end
            local ok, why = M.TakeItem(inst, item)
            M.FinishTask(inst, ok, why, { item = item.prefab, item_guid = item.GUID, count = StackOf(item) })
        end)
        ba:AddFailAction(function() if M.GetTask(inst) == task then M.FinishTask(inst, false, "unreachable") end end)
        return ba
    elseif task.kind == "goto" then
        local target = task.target_guid and _G.Ents[task.target_guid] or nil
        if task.target_guid and not (target and target:IsValid()) then M.FinishTask(inst, false, "gone") return nil end
        local ba
        if target then ba = _G.BufferedAction(inst, target, _G.ACTIONS.WALKTO, nil, nil, nil, 2)
        elseif task.x and task.z then ba = _G.BufferedAction(inst, nil, _G.ACTIONS.WALKTO, nil, _G.Vector3(task.x, 0, task.z), nil, 1)
        else M.FinishTask(inst, false, "bad_target") return nil end
        ba:AddSuccessAction(function() if M.GetTask(inst) == task then M.FinishTask(inst, true) end end)
        ba:AddFailAction(function() if M.GetTask(inst) == task then M.FinishTask(inst, false, "unreachable") end end)
        return ba
    end
    M.FinishTask(inst, false, "bad_kind")
    return nil
end

--- On arrival at a pickup. store="self": stash it and report `brain_collected`;
--- store="event": only report `brain_item_reached` and let the flow act.
function M.Collect(inst, item)
    local st = inst and inst._dstp_brain
    if not (st and M.CanCollect(inst, item, st)) then return false end
    local count, prefab = StackOf(item), item.prefab
    if st.store == "event" then
        local x, z, _y   -- NB: `t and f()` truncates multiple returns; `_` must be declared (strict mode)
        if item.Transform then x, _y, z = item.Transform:GetWorldPosition() end
        Push(inst, "brain_item_reached", { item = prefab, item_guid = item.GUID, count = count,
            x = x and math.floor(x + 0.5) or nil, z = z and math.floor(z + 0.5) or nil })
        return true
    end
    local ok, why = M.TakeItem(inst, item)
    if ok then
        Push(inst, "brain_collected", { item = prefab, count = count })
        return true
    end
    -- did not fit: report with the reason and back off from THIS item for a while, so
    -- the flow can act (unload / drop / stop) without the mob pacing to the same item
    item._dstp_skip_until = ((_G and _G.GetTime and _G.GetTime()) or 0) + 10
    local x, z, _y   -- strict mode: never assign to an undeclared `_`
    if item.Transform then x, _y, z = item.Transform:GetWorldPosition() end
    Push(inst, "brain_item_reached", { item = prefab, item_guid = item.GUID, count = count, reason = why or "refused",
        x = x and math.floor(x + 0.5) or nil, z = z and math.floor(z + 0.5) or nil })
    return false
end

--- For the brain's DoAction: a WALKTO to the nearest pickup that collects on arrival.
function M.CollectAction(inst)
    local st = inst and inst._dstp_brain
    if not (st and st.mode == "collect") then return nil end
    local item = M.FindPickup(inst, st)
    if not item then return nil end
    local ba = _G.BufferedAction(inst, item, _G.ACTIONS.WALKTO, nil, nil, nil, 1.5)
    ba:AddSuccessAction(function() M.Collect(inst, item) end)
    -- unreachable / interrupted: back off from THIS item so the mob does not loop on it
    -- forever and never gets to follow (mechanism, not policy)
    ba:AddFailAction(function() item._dstp_skip_until = ((_G and _G.GetTime and _G.GetTime()) or 0) + 15 end)
    return ba
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
Push = function(inst, typ, extra)
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
    -- task timeout (the brain's DoAction has its own, but this one always reports)
    if st.task and st.task.deadline then
        local now = (_G and _G.GetTime and _G.GetTime()) or 0
        if now > st.task.deadline then M.FinishTask(inst, false, "timeout") end
    end
    if st.mode ~= "follow" and st.mode ~= "collect" then mon.arrived, mon.leader_lost = nil, nil return end
    if st.mode == "collect" and not (st.target_userid or st.target_guid) then return end
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
        -- persistence: the flow-set state survives a world save/load (components/dstp_flowbrain.lua)
        if inst.AddComponent and not (inst.components and inst.components.dstp_flowbrain) then
            _G.pcall(function() inst:AddComponent("dstp_flowbrain") end)
        end
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

--- After a world load re-applied a saved state: tell the flow, with the NEW guid.
function M.AnnounceRestored(inst)
    local st = inst and inst._dstp_brain
    if not st then return end
    Push(inst, "brain_restored", { target_userid = st.target_userid, x = st.x, z = st.z })
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
    if inst.RemoveComponent and inst.components and inst.components.dstp_flowbrain then
        _G.pcall(function() inst:RemoveComponent("dstp_flowbrain") end)
    end
    return true
end

function M.Init(env)
    _G = env.GLOBAL
    Core = env.core
    return M
end

return M
