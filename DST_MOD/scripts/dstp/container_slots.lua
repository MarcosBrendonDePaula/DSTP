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

return M
