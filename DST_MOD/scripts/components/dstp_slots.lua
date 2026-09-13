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
    if not (data and data.n) then return end
    self.n = data.n
    -- Primary re-apply is modmain's OnPreLoad hook (before Container:OnLoad). Belt and
    -- braces: if the container is still smaller than the saved count here, grow it now
    -- (component OnLoad order is pairs() order — this may run before or after the
    -- container's own OnLoad; before = items land fine, after = nothing left to fix).
    local c = self.inst.components and self.inst.components.container
    if c and (c.numslots or 0) < data.n then
        local CS = require("dstp/container_slots")
        local params = require("containers").params
        local ok, why = CS.ApplyToInstance(self.inst, data.n, params, Vector3, true)
        if not ok then print("[DSTP] dstp_slots OnLoad: could not grow " .. tostring(self.inst.prefab) .. ": " .. tostring(why)) end
        if self.inst._dstp_slots and self.inst._dstp_slots.set then self.inst._dstp_slots:set(data.n) end
    end
end

return DstpSlots
