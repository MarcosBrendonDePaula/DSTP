-- DSTP flow-brain persistence shim (see dstp/flow_brain.lua). The state the FLOW set on
-- a mob (mode, target, anchor, filters) is saved with the entity and re-applied on load,
-- so a flow-controlled mob keeps behaving across a world save/load. GUIDs change on
-- load, so the module announces `brain_restored { guid, prefab, mode, target_userid }`
-- and the flow refreshes whatever it remembered (in-game 2026-09-13: a persisted pet
-- came back idle with a stale guid in the flow's memory). One-shot tasks are not saved.
local DstpFlowBrain = Class(function(self, inst)
    self.inst = inst
    self.saved = nil
end)

function DstpFlowBrain:OnSave()
    local st = self.inst._dstp_brain
    if not st then return nil end
    return {
        -- Klei only calls a component's OnLoad if the freshly built entity HAS the
        -- component, unless the saved data says so — this brain is added at runtime, so
        -- without this flag the state was saved but never restored (in-game 2026-09-13:
        -- the pet came back brainless after a load, the flow spawned a new empty one).
        add_component_if_missing = true,
        mode = st.mode, target_userid = st.target_userid, target_guid = nil,   -- guids do not survive a load
        x = st.x, z = st.z, radius = st.radius, tags = st.tags, prefabs = st.prefabs,
        attack_players = st.attack_players, store = st.store,
        follow_min = st.follow_min, follow_dist = st.follow_dist, follow_max = st.follow_max,
    }
end

function DstpFlowBrain:OnLoad(data)
    if not (data and data.mode) then return end
    local FlowBrain = require("dstp/flow_brain")
    -- a follow/collect that pointed at an entity guid cannot be restored (guid gone) → stay
    local spec = {
        mode = data.mode, target = data.target_userid,
        anchor_x = data.x, anchor_z = data.z, brain_radius = data.radius,
        tags = data.tags, prefabs = data.prefabs, attack_players = data.attack_players, store = data.store,
        follow_min = data.follow_min, follow_dist = data.follow_dist, follow_max = data.follow_max,
    }
    if (spec.mode == "follow") and not spec.target then spec.mode = "stay" end
    -- the entity may still be initialising: apply next frame, when components/brain exist
    self.inst:DoTaskInTime(0, function()
        if not self.inst:IsValid() then return end
        local ok = FlowBrain.Apply(self.inst, spec)
        if ok then FlowBrain.AnnounceRestored(self.inst) end
    end)
end

return DstpFlowBrain
