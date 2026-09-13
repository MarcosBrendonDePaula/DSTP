-- dstp_flowbrain — the Klei Brain that executes what the flow decided. Every node reads
-- the entity's `_dstp_brain` state through dstp/flow_brain (mode, leader, anchor,
-- radius) at evaluation time, so a mode change from the flow takes effect on the next
-- tick without rebuilding the tree. Zero policy here: the policy is the flow's.
require "behaviours/follow"
require "behaviours/chaseandattack"
require "behaviours/wander"
require "behaviours/runaway"
require "behaviours/leash"
require "behaviours/standstill"
require "behaviours/doaction"

local BrainCommon = require "brains/braincommon"
local FlowBrain = require "dstp/flow_brain"

local MAX_CHASE_TIME = 20
local GIVE_UP_DIST = 30

local DSTPFlowBrain = Class(Brain, function(self, inst)
    Brain._ctor(self, inst)
end)

local function state(inst) return FlowBrain.GetState(inst) or {} end
local function mode(inst) return state(inst).mode end
local function leader(inst) return FlowBrain.ResolveLeader(state(inst)) end
local function anchor(inst) return FlowBrain.ResolveAnchor(inst, state(inst)) end
local function radius(inst) return state(inst).radius or 12 end

-- RunAway "hunter" params: players always count as hunters in flee mode, plus `tags`.
local function fleeParams(inst)
    local st = state(inst)
    return { tags = st.tags or { "player" }, notags = { "INLIMBO" } }
end

function DSTPFlowBrain:OnStart()
    local inst = self.inst
    local root = PriorityNode({
        BrainCommon.PanicTrigger(inst),

        WhileNode(function() return mode(inst) == "attack" end, "FlowAttack",
            ChaseAndAttack(inst, MAX_CHASE_TIME, GIVE_UP_DIST)),

        WhileNode(function() return mode(inst) == "guard" end, "FlowGuard",
            PriorityNode({
                ChaseAndAttack(inst, MAX_CHASE_TIME, function() return radius(inst) * 1.5 end),
                Leash(inst, function() return anchor(inst) end, function() return radius(inst) end, 2),
                Wander(inst, function() return anchor(inst) end, function() return radius(inst) * 0.6 end),
            }, .25)),

        WhileNode(function() return mode(inst) == "follow" end, "FlowFollow",
            PriorityNode({
                Follow(inst, function() return leader(inst) end,
                    function() return state(inst).follow_min end,
                    function() return state(inst).follow_dist end,
                    function() return state(inst).follow_max end, true),
                StandStill(inst),
            }, .25)),

        -- collect: walk to the nearest pickup and stash it (FlowBrain.CollectAction gives
        -- a WALKTO whose success action stores the item); nothing to pick → follow the
        -- leader (if any) → stand still
        -- Follow comes FIRST: it only takes over when the mob is beyond follow_max from
        -- the leader (Follow fails while in range, so the pickup runs) — the pet never
        -- wanders off after items; FindPickup also centres its radius on the leader.
        WhileNode(function() return mode(inst) == "collect" end, "FlowCollect",
            PriorityNode({
                WhileNode(function() return leader(inst) ~= nil end, "CollectFollow",
                    Follow(inst, function() return leader(inst) end,
                        function() return state(inst).follow_min end,
                        function() return state(inst).follow_dist end,
                        function() return state(inst).follow_max end, true)),
                DoAction(inst, function() return FlowBrain.CollectAction(inst) end, "Collect", true, 12),
                StandStill(inst),
            }, .25)),

        WhileNode(function() return mode(inst) == "flee" end, "FlowFlee",
            RunAway(inst, function() return fleeParams(inst) end,
                function() return radius(inst) end, function() return radius(inst) * 1.5 end)),

        WhileNode(function() return mode(inst) == "wander" end, "FlowWander",
            Wander(inst, function() return anchor(inst) end, function() return radius(inst) end)),

        StandStill(inst),   -- "stay" (and any unknown mode)
    }, .25)
    self.bt = BT(inst, root)
end

return DSTPFlowBrain
