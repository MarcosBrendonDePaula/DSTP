-- DSTP Land Claims — server-side terrain protection
--
-- REFERENCE "MECHANIC MODULE". A hardcoded Lua mechanic is fine in DSTP as long as
-- it's a clean, self-contained module — this file is the model to copy. The pattern:
-- a single scripts/dstp/<mechanic>.lua singleton holds all the state + logic with a
-- small public API; modmain only adds the MINIMUM hook (the overrides below call
-- IsProtected); persistence is a real world component (dstp_landclaims.lua) that
-- delegates here; and control is exposed to flows via mod commands (claim_*) + a
-- node, so the POLICY (who/when/limits) stays in the flow. Use Lua only for what
-- truly needs the frame/engine (here: an in-frame veto); prefer a flow otherwise.
-- See CLAUDE.md "Hardcoded mechanics ARE fine — as clean, isolated mod modules".
--
-- A generic protection ENGINE. The policy (who may claim, limits, cost) lives in
-- the panel flows; this module only answers "is this point protected from this
-- doer?" and stores the claims. There is NO veto callback in workable/burnable
-- (confirmed: workable.lua WorkedBy_Internal and burnable.lua Ignite apply their
-- effect synchronously in-frame), so the only way to block is to OVERRIDE those
-- methods via AddComponentPostInit — done in modmain. A flow can't block in-frame
-- because it round-trips through the backend; that's why this is Lua, not a flow.
--
-- Persistence: claims live on a TheWorld component (dstp_landclaims) and are saved
-- with the world (OnSave/OnLoad), so they survive restarts and don't need the
-- backend to be alive.

local LandClaims = {}

local _G = nil
local DEBUG = false

local function Log(msg) if DEBUG then print("[DSTP-claims] " .. msg) end end
local function LogError(msg) print("[DSTP-claims][ERROR] " .. tostring(msg)) end

-- claims[owner_userid] = { { x=, z=, radius=, trusted={ uid=true, ... } }, ... }
local claims = {}

-- ---- helpers ---------------------------------------------------------------

local function GetUserId(ent)
    if not ent then return nil end
    -- players carry userid; some doers (lightning, etc) don't.
    return ent.userid or (ent.components and ent.components.inventory and nil)
end

local function IsAdmin(ent)
    local uid = ent and ent.userid
    if not uid or not _G.TheNet then return false end
    for _, c in ipairs(_G.TheNet:GetClientTable() or {}) do
        if c.userid == uid then return c.admin == true end
    end
    return false
end

-- dist² compare avoids a sqrt on the hot path.
local function WithinRadius(cx, cz, x, z, radius)
    local dx, dz = x - cx, z - cz
    return (dx * dx + dz * dz) <= (radius * radius)
end

-- ---- core query (the hot path) --------------------------------------------

-- Returns true if (x,z) is inside a claim whose owner is not `doer`, the doer is
-- not trusted by that claim, and the doer is not a server admin → BLOCK.
-- Owner, trusted friends and admins always pass. A nil doer (wildfire, lightning)
-- is treated as "no userid" → blocked inside any claim (protects from world fire).
function LandClaims.IsProtected(x, z, doer)
    local doer_uid = doer and doer.userid or nil
    local doer_admin = doer and IsAdmin(doer) or false

    for owner, list in pairs(claims) do
        for _, c in ipairs(list) do
            if WithinRadius(c.x, c.z, x, z, c.radius) then
                -- inside this claim — is the doer allowed?
                if doer_admin then return false end
                if doer_uid and doer_uid == owner then return false end
                if doer_uid and c.trusted and c.trusted[doer_uid] then return false end
                return true  -- inside, and not owner/trusted/admin
            end
        end
    end
    return false
end

-- ---- mutations (called by the new commands) -------------------------------

function LandClaims.Add(owner, x, z, radius)
    if not (owner and x and z) then return false, "missing owner/x/z" end
    radius = tonumber(radius) or 20
    claims[owner] = claims[owner] or {}
    table.insert(claims[owner], { x = x, z = z, radius = radius, trusted = {} })
    Log(("add %s @(%d,%d) r=%d"):format(tostring(owner), x, z, radius))
    return true
end

-- Remove by owner (all their claims) or, if x/z given, the single claim that
-- contains that point (any owner — for admin cleanup).
function LandClaims.Remove(owner, x, z)
    if x and z then
        for o, list in pairs(claims) do
            for i, c in ipairs(list) do
                if WithinRadius(c.x, c.z, x, z, c.radius) then
                    table.remove(list, i)
                    if #list == 0 then claims[o] = nil end
                    return true
                end
            end
        end
        return false, "no claim at point"
    end
    if owner and claims[owner] then
        claims[owner] = nil
        return true
    end
    return false, "nothing to remove"
end

-- Add/remove a trusted userid on the claim that contains (x,z), owned by `owner`.
function LandClaims.Trust(owner, x, z, friend, on)
    if not (owner and friend and claims[owner]) then return false, "no owner/friend" end
    for _, c in ipairs(claims[owner]) do
        if (x == nil or z == nil) or WithinRadius(c.x, c.z, x, z, c.radius) then
            c.trusted = c.trusted or {}
            c.trusted[friend] = on and true or nil
            return true
        end
    end
    return false, "no matching claim"
end

-- Which owner (if any) holds the claim at (x,z)?
function LandClaims.OwnerAt(x, z)
    for owner, list in pairs(claims) do
        for _, c in ipairs(list) do
            if WithinRadius(c.x, c.z, x, z, c.radius) then return owner, c end
        end
    end
    return nil
end

-- Flat list for claim_list. { owner, x, z, radius, trusted = {uid,...} }
function LandClaims.List()
    local out = {}
    for owner, list in pairs(claims) do
        for _, c in ipairs(list) do
            local trusted = {}
            for uid in pairs(c.trusted or {}) do trusted[#trusted + 1] = uid end
            out[#out + 1] = { owner = owner, x = c.x, z = c.z, radius = c.radius, trusted = trusted }
        end
    end
    return out
end

-- ---- persistence (TheWorld component) -------------------------------------

-- Serialize/deserialize the whole table for OnSave/OnLoad.
function LandClaims.Serialize() return { claims = claims } end
function LandClaims.Deserialize(data)
    if type(data) == "table" and type(data.claims) == "table" then
        claims = data.claims
        -- defensive: ensure trusted tables exist
        for _, list in pairs(claims) do
            for _, c in ipairs(list) do c.trusted = c.trusted or {} end
        end
        Log("loaded claims from save")
    end
end

-- Persistence is handled by a REAL world component (scripts/components/
-- dstp_landclaims.lua) added via AddPrefabPostInit("world"). The engine only
-- aggregates OnSave/OnLoad of components loaded from components/<name>.lua
-- (entityscript.lua GetPersistData / LoadComponent), so a plain table on
-- world.components is NOT saved. That component just delegates to Serialize/
-- Deserialize above.

function LandClaims.Init(env)
    _G = env.GLOBAL
    DEBUG = env.debug_logs == true
    Log("init")
    return LandClaims
end

return LandClaims
