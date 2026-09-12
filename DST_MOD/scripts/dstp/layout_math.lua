-- DSTP layout_math — the flex arithmetic behind the in-game UI layout.
--
-- PURE module: no widgets, no _G, no state. Ported from rts-dom
-- (crates/rts-dom/src/layout/{coluna,flex_limites,flex_margens_auto}.rs) — the functions
-- that decide where a flex item lands, minus what needs a DOM (wrap, baseline,
-- min-content measurement). Mirrored 1:1 by frontend/app/shared/automation/layoutMath.ts;
-- both are pinned to layout-math-fixtures.json by layout-math.test.ts (fengari) so the
-- panel preview and the game can never disagree on a position.
--
-- SPACE CONVENTION: CSS space. Origin top-left, y grows DOWN. `main`/`cross` are axis
-- names, not x/y: row → main=x, cross=y; column → main=y, cross=x. `ToDst` is the ONE
-- conversion into DST's centered, y-up widget space — do the math here, convert once.
--
-- "Fixed size is a MINIMUM": a declared track/cross size never clips content, the box
-- grows to fit (the legacy renderer always did that; a clipped HUD is useless). So
-- LayoutLine never sees negative free space; the overflow branch of JustifyOffsets is
-- kept for parity with rts-dom/Chrome and for callers that DO clip.

local M = {}

-- justify-content: returns leading, between for n items sharing `free` space.
function M.JustifyOffsets(justify, free, n)
    if free <= 0 then
        -- overflow (Chrome): center overflows symmetrically, end flushes to the end,
        -- start and every space-* flush to the start.
        if justify == "center" then return free / 2, 0 end
        if justify == "end" then return free, 0 end
        return 0, 0
    end
    if justify == "end" then return free, 0
    elseif justify == "center" then return free / 2, 0
    elseif justify == "between" then
        if n > 1 then return 0, free / (n - 1) end
        return 0, 0
    elseif justify == "around" then
        if n >= 1 then return free / (2 * n), free / n end
        return 0, 0
    elseif justify == "evenly" then return free / (n + 1), free / (n + 1)
    end
    return 0, 0   -- start (and anything unknown)
end

-- align-items: cross offset of an item of size `item` inside a line of size `line`.
-- stretch = start (real stretch needs an imposed size — same cut as rts-dom).
function M.AlignOffset(align, line, item)
    local free = line - item
    if align == "end" then return free end
    if align == "center" then return free / 2 end
    return 0
end

-- Cross-axis `margin: auto` (Flexbox §8.1): absorbs the free space and BEATS align.
-- nil when neither margin is auto → the caller falls back to AlignOffset.
function M.AutoMarginCross(autoStart, autoEnd, line, item)
    if not autoStart and not autoEnd then return nil end
    local free = math.max(line - item, 0)
    if autoStart and autoEnd then return free / 2 end
    if autoStart then return free end
    return 0
end

-- Clamp by the ceiling first, then the floor — min wins on conflict (CSS2 §10.4).
function M.ClampFinal(main, min, max)
    local v = main
    if max ~= nil and v > max then v = max end
    local floor = min or 0
    if v < floor then v = floor end
    return v
end

-- flex-grow/flex-shrink on one line (Flexbox §9.7), then the min/max clamp.
-- items[i] = { base=outer main size, grow (0), shrink (1), min (0), max (nil) }.
-- `gap` is per-gap; (n-1)*gap leaves the free space. Returns the final outer sizes.
function M.ResolveMainSizes(items, content, gap)
    local n = #items
    local totalGap = math.max(n - 1, 0) * (gap or 0)
    local main, sumBase, sumGrow = {}, 0, 0
    for i, it in ipairs(items) do
        main[i] = it.base
        sumBase = sumBase + it.base
        sumGrow = sumGrow + (it.grow or 0)
    end
    local freePre = content - sumBase - totalGap
    if freePre > 0 and sumGrow > 0 then
        for i, it in ipairs(items) do main[i] = it.base + freePre * (it.grow or 0) / sumGrow end
    elseif freePre < 0 then
        -- Split the deficit among the still-free items weighted by shrink*base; an item
        -- that would cross its own [min,max] freezes at that bound and leaves the split;
        -- the deficit left over goes back to the free items on the next round.
        local frozen = {}
        local deficit = freePre
        while true do
            local weighted = 0
            for i, it in ipairs(items) do
                if not frozen[i] then weighted = weighted + (it.shrink or 1) * it.base end
            end
            if weighted <= 0 or deficit >= -0.01 then break end
            local newlyFrozen = false
            for i, it in ipairs(items) do
                if not frozen[i] then
                    local proposed = it.base + deficit * ((it.shrink or 1) * it.base) / weighted
                    local lo = it.min or 0
                    if proposed <= lo then
                        main[i] = lo; frozen[i] = true; newlyFrozen = true
                    elseif it.max ~= nil and proposed >= it.max then
                        main[i] = it.max; frozen[i] = true; newlyFrozen = true
                    else
                        main[i] = proposed
                    end
                end
            end
            if not newlyFrozen then break end
            local frozenSum, freeBaseSum = 0, 0
            for i, it in ipairs(items) do
                if frozen[i] then frozenSum = frozenSum + main[i] else freeBaseSum = freeBaseSum + it.base end
            end
            deficit = math.min(content - totalGap - frozenSum - freeBaseSum, 0)
            if deficit >= -0.01 then break end
        end
    end
    for i, it in ipairs(items) do main[i] = M.ClampFinal(main[i], it.min, it.max) end
    return main
end

local function side(it, v, auto)
    if auto then return 0 end
    if v ~= nil then return v end
    return it.margin or 0
end

-- Lay one flex line out. items[i] = { main, cross (border-box sizes), grow, shrink, min,
-- max, margin (all sides), marginMainStart/End, marginCrossStart/End,
-- autoMainStart/End, autoCrossStart/End }. opts = { track, cross (declared content
-- sizes, MINIMUMS; nil = auto), gap, justify, align }.
-- Returns { items = { {main=, cross=, size=} ... }, used = { main=, cross= } }: each
-- item's BORDER-BOX start (margins outside) relative to the content-box origin.
function M.LayoutLine(items, opts)
    opts = opts or {}
    local n = #items
    local gap = opts.gap or 0
    local totalGap = math.max(n - 1, 0) * gap
    local mStart, mEnd, cStart, cEnd = {}, {}, {}, {}
    for i, it in ipairs(items) do
        mStart[i] = side(it, it.marginMainStart, it.autoMainStart)
        mEnd[i] = side(it, it.marginMainEnd, it.autoMainEnd)
        cStart[i] = side(it, it.marginCrossStart, it.autoCrossStart)
        cEnd[i] = side(it, it.marginCrossEnd, it.autoCrossEnd)
    end

    -- main axis — OUTER sizes (border-box + margins), like rts-dom's FlexItem.base.
    local baseOuter, sumBase = {}, totalGap
    for i, it in ipairs(items) do
        baseOuter[i] = it.main + mStart[i] + mEnd[i]
        sumBase = sumBase + baseOuter[i]
    end
    local outer, track
    if opts.track ~= nil then
        track = math.max(opts.track, sumBase)   -- fixed = minimum: grow to fit, never clip
        local mi = {}
        for i, it in ipairs(items) do
            mi[i] = { base = baseOuter[i], grow = it.grow, shrink = it.shrink,
                      min = (it.min or 0) + mStart[i] + mEnd[i],
                      max = (it.max ~= nil) and (it.max + mStart[i] + mEnd[i]) or nil }
        end
        outer = M.ResolveMainSizes(mi, track, gap)
    else
        track = sumBase
        outer = baseOuter
    end
    local sumOuter, autoCount = totalGap, 0
    for i, it in ipairs(items) do
        sumOuter = sumOuter + outer[i]
        if it.autoMainStart then autoCount = autoCount + 1 end
        if it.autoMainEnd then autoCount = autoCount + 1 end
    end
    local free = track - sumOuter
    local leading, between = 0, 0
    if free > 0 and autoCount > 0 then
        -- auto margins absorb the free space BEFORE justify-content (Flexbox §8.1)
        local share = free / autoCount
        for i, it in ipairs(items) do
            if it.autoMainStart then mStart[i] = mStart[i] + share; outer[i] = outer[i] + share end
            if it.autoMainEnd then mEnd[i] = mEnd[i] + share; outer[i] = outer[i] + share end
        end
    else
        leading, between = M.JustifyOffsets(opts.justify or "start", free, n)
    end

    -- cross axis
    local outerCross, line = {}, opts.cross or 0
    for i, it in ipairs(items) do
        outerCross[i] = it.cross + cStart[i] + cEnd[i]
        if outerCross[i] > line then line = outerCross[i] end
    end

    local out = {}
    local cursor = leading
    for i, it in ipairs(items) do
        local size = outer[i] - mStart[i] - mEnd[i]
        local off = M.AutoMarginCross(it.autoCrossStart and true or false, it.autoCrossEnd and true or false, line, outerCross[i])
        if off == nil then off = M.AlignOffset(opts.align or "start", line, outerCross[i]) end
        out[i] = { main = cursor + mStart[i], cross = off + cStart[i], size = size }
        cursor = cursor + outer[i] + gap + between
    end
    return { items = out, used = { main = track, cross = line } }
end

-- CSS top-left box (x,y,w,h) inside a W×H container centered at the origin → the DST
-- widget CENTER (DST widgets are centered on their own origin and y grows UP).
function M.ToDst(x, y, w, h, W, H)
    return x - W / 2 + w / 2, H / 2 - y - h / 2
end

return M
