-- container_slots.lua — bigger containers, as data (mechanic module).
--
-- A container's slot count AND the on-screen position of every slot come from
-- `containers.params[prefab].widget.slotpos`, read by the SERVER (Container:WidgetSetup →
-- SetNumSlots) and by every CLIENT (the replica draws the window from the same table).
-- So the only correct place to grow a chest is that table, at mod load, on both sides,
-- with the same numbers — which is what modmain does with the modinfo options
-- (CHEST_SLOTS / CHESTER_SLOTS / BACKPACK_SLOTS / ICEBOX_SLOTS). This is NOT runtime and
-- NOT per flow: it is world configuration every client must share.
--
-- Layout: a centred grid with Klei's 80 px pitch (the chest uses 80; the backpack 75 —
-- we keep 80 everywhere: slots stay readable, the frame art is just smaller than the
-- grid for big counts). Cosmetic only; the frame anim is left as-is.
local M = {}

--- Columns for n slots: 3 up to 9, 4 up to 16, 5 up to 25, else 6.
function M.Cols(n)
    if n <= 9 then return 3 elseif n <= 16 then return 4 elseif n <= 25 then return 5 else return 6 end
end

--- Centred grid of n cells (row-major, top row first) → { {x=,y=}, ... }.
function M.Grid(n, cols, pitch)
    n = math.max(0, math.floor(tonumber(n) or 0))
    cols = cols or M.Cols(n)
    pitch = pitch or 80
    local rows = math.ceil(n / cols)
    local out = {}
    for i = 0, n - 1 do
        local col, row = i % cols, math.floor(i / cols)
        out[#out + 1] = {
            x = (col - (cols - 1) / 2) * pitch,
            y = ((rows - 1) / 2 - row) * pitch,
        }
    end
    return out
end

--- Apply overrides { prefab = numslots } to Klei's `containers.params`. Only GROWS a
--- container (never shrinks — items in removed slots would be lost). Aliases that share
--- the same params table (pandoraschest = treasurechest) grow together, as in vanilla.
--- Returns the list of prefabs changed.
function M.Apply(params, overrides, Vector3)
    local changed = {}
    for prefab, n in pairs(overrides or {}) do
        n = tonumber(n)
        local p = params and params[prefab]
        if p and p.widget and n and n > #(p.widget.slotpos or {}) then
            local grid = M.Grid(n)
            local slotpos = {}
            for i, g in ipairs(grid) do slotpos[i] = Vector3 and Vector3(g.x, g.y, 0) or { x = g.x, y = g.y, z = 0 } end
            p.widget.slotpos = slotpos
            p.widget.numslots = nil   -- derived from #slotpos by containers.widgetsetup
            changed[#changed + 1] = prefab
        end
    end
    return changed
end

-- ── per-INSTANCE slots, controlled by the flow (entity_set_slots) ─────────────
-- Klei's Container:WidgetSetup(prefab, data) accepts a per-instance layout, but nothing
-- ships that layout to clients (they draw from the static params). Our transport: a
-- net_byte "dstp.slots" per container (declared on both sides in modmain for every prefab
-- in containers.params); the server sets it, the client re-runs WidgetSetup with the
-- grown grid on dirty. Persisted by components/dstp_slots.lua + an OnPreLoad hook, so
-- the grown chest keeps its items across a save/load. Only grows (Klei asserts).

--- A COPY of params[prefab] with n slots on the centred grid (never mutates the global).
function M.Data(params, prefab, n, Vector3)
    local base = params and params[prefab]
    if not (base and base.widget) then return nil end
    n = math.floor(tonumber(n) or 0)
    local data = {}
    for k, v in pairs(base) do data[k] = v end
    local widget = {}
    for k, v in pairs(base.widget) do widget[k] = v end
    local slotpos = {}
    for i, g in ipairs(M.Grid(n)) do slotpos[i] = Vector3 and Vector3(g.x, g.y, 0) or { x = g.x, y = g.y, z = 0 } end
    widget.slotpos, widget.numslots = slotpos, nil
    data.widget = widget
    return data
end

--- Apply n slots to ONE live entity on this side. Server: the component; client: the
--- replica. Returns true when applied, false + reason otherwise.
function M.ApplyToInstance(inst, n, params, Vector3, isServer)
    if not (inst and inst.prefab) then return false, "bad_inst" end
    n = math.floor(tonumber(n) or 0)
    local target = isServer and inst.components and inst.components.container
        or (not isServer) and inst.replica and inst.replica.container
    if not target then return false, "no_container" end
    local cur = isServer and target.numslots or (target.GetNumSlots and target:GetNumSlots()) or 0
    if n <= (cur or 0) then return false, "not_bigger" end
    local data = M.Data(params, inst.prefab, n, Vector3)
    if not data then return false, "no_params" end
    target:WidgetSetup(inst.prefab, data)
    return true
end

--- Server entry point (the command): apply, replicate through the netvar, persist.
function M.SetInstance(inst, n, params, Vector3)
    local ok, why = M.ApplyToInstance(inst, n, params, Vector3, true)
    if not ok then return false, why end
    n = math.floor(tonumber(n))
    if inst._dstp_slots and inst._dstp_slots.set then inst._dstp_slots:set(n) end
    if inst.components and inst.components.dstp_slots then inst.components.dstp_slots.n = n end
    return true
end

return M
