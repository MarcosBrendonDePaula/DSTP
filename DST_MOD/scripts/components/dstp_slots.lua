-- DSTP per-instance container slots — persistence shim (see dstp/container_slots.lua).
-- Holds the flow-set slot count so it is saved with the entity; the re-apply on load
-- happens in modmain's OnPreLoad hook (BEFORE Container:OnLoad puts items back by slot
-- index — otherwise items in the grown slots would be lost).
local DstpSlots = Class(function(self, inst)
    self.inst = inst
    self.n = nil
end)

function DstpSlots:OnSave()
    if self.n then return { n = self.n } end
    return nil
end

function DstpSlots:OnLoad(data)
    -- the layout itself was applied in OnPreLoad; just keep the number for the next save
    if data and data.n then self.n = data.n end
end

return DstpSlots
