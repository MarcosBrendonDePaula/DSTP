-- DSTP land-claims world component — persistence shim.
--
-- The actual claim store + IsProtected logic lives in the singleton module
-- dstp/land_claims (required once by modmain, shared everywhere). This component
-- exists ONLY so the engine saves/loads the claims with the world: the engine
-- aggregates OnSave/OnLoad of components loaded from components/<name>.lua
-- (entityscript.lua GetPersistData / LoadComponent), so a real component file is
-- required for persistence — a plain table on world.components is not saved.

local LandClaims = require("dstp/land_claims")

local DstpLandClaims = Class(function(self, inst)
    self.inst = inst
end)

function DstpLandClaims:OnSave()
    return LandClaims.Serialize()
end

function DstpLandClaims:OnLoad(data)
    LandClaims.Deserialize(data)
end

return DstpLandClaims
