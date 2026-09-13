-- DSTP stable entity id — persistence shim for dstp/entity_ids.lua. Saved with the
-- entity, re-added on load (add_component_if_missing), re-indexed so the flow can keep
-- addressing the same entity by `id` across world loads (guids do not survive them).
local EntityIds = require("dstp/entity_ids")

local DstpId = Class(function(self, inst)
    self.inst = inst
    self.id = nil
end)

function DstpId:OnSave()
    if not self.id then return nil end
    return { id = self.id, add_component_if_missing = true }
end

function DstpId:OnLoad(data)
    if data and data.id then
        self.id = data.id
        EntityIds.Register(self.id, self.inst)
    end
end

return DstpId
