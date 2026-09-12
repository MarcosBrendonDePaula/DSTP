// Flex arithmetic for the in-game UI — the panel-side mirror of
// DST_MOD/scripts/dstp/layout_math.lua. Ported from rts-dom
// (crates/rts-dom/src/layout/{coluna,flex_limites,flex_margens_auto}.rs): the pure
// functions that decide where a flex item lands, minus everything that needs a DOM
// (wrap, baseline, min-content measurement).
//
// Both implementations are pinned to app/shared/automation/layout-math-fixtures.json by
// app/server/live/layout-math.test.ts — change one, change both.
//
// SPACE CONVENTION: CSS space. Origin top-left, y grows DOWN. `main`/`cross` are axis
// names, not x/y: for a row main=x, cross=y; for a column main=y, cross=x. `toDst` is
// the single conversion into DST's centered, y-up widget space.
//
// "Fixed size is a MINIMUM": a container's declared track/cross size never clips its
// content — the box grows to fit (that's how the legacy renderer always behaved, and a
// clipped HUD is useless in-game). So `layoutLine` never sees negative free space; the
// overflow branch of `justifyOffsets` exists for parity with rts-dom/Chrome and for
// callers that DO clip.

/** The flex-item style keys a child may carry (mirrored by NormalizeElement in Lua). */
export const FLEX_ITEM_KEYS = [
  'grow', 'flex', 'shrink', 'min_width', 'max_width', 'min_height', 'max_height',
  'margin_top', 'margin_right', 'margin_bottom', 'margin_left',
] as const

export type Justify = 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly' | (string & {})
export type Align = 'start' | 'end' | 'center' | 'stretch' | (string & {})

/** `justify-content`: (leading, between) offsets for `n` items sharing `free` space. */
export function justifyOffsets(justify: Justify, free: number, n: number): [number, number] {
  if (free <= 0) {
    // overflow — Chrome: center overflows symmetrically, end flushes to the end,
    // start and every space-* flush to the start.
    if (justify === 'center') return [free / 2, 0]
    if (justify === 'end') return [free, 0]
    return [0, 0]
  }
  switch (justify) {
    case 'end': return [free, 0]
    case 'center': return [free / 2, 0]
    case 'between': return n > 1 ? [0, free / (n - 1)] : [0, 0]
    case 'around': return n >= 1 ? [free / (2 * n), free / n] : [0, 0]
    case 'evenly': return [free / (n + 1), free / (n + 1)]
    default: return [0, 0]   // start (and anything unknown)
  }
}

/** `align-items`: cross offset of an item of size `item` inside a line of size `line`.
 *  stretch = start (the real stretch needs an imposed size — same cut as rts-dom). */
export function alignOffset(align: Align, line: number, item: number): number {
  const free = line - item
  if (align === 'end') return free
  if (align === 'center') return free / 2
  return 0
}

/** Cross-axis `margin: auto` (Flexbox §8.1): absorbs the free space and BEATS align.
 *  Returns null when neither margin is auto → the caller falls back to alignOffset. */
export function autoMarginCross(autoStart: boolean, autoEnd: boolean, line: number, item: number): number | null {
  if (!autoStart && !autoEnd) return null
  const free = Math.max(line - item, 0)
  if (autoStart && autoEnd) return free / 2
  if (autoStart) return free
  return 0
}

/** Clamp by the ceiling first, then the floor — min wins when they conflict (CSS2 §10.4). */
export function clampFinal(main: number, min?: number | null, max?: number | null): number {
  return Math.max(Math.min(main, max ?? Infinity), min ?? 0)
}

export interface MainItem {
  base: number          // outer main size before grow/shrink
  grow?: number         // flex-grow (default 0)
  shrink?: number       // flex-shrink (default 1)
  min?: number | null   // floor (default 0)
  max?: number | null   // ceiling (default none)
}

/** `flex-grow`/`flex-shrink` on one line (Flexbox §9.7), then the min/max clamp.
 *  `gap` is per-gap; `(n-1)*gap` leaves the free space. Returns the final outer main sizes. */
export function resolveMainSizes(items: MainItem[], content: number, gap: number): number[] {
  const n = items.length
  const totalGap = Math.max(n - 1, 0) * gap
  const grow = items.map(it => it.grow ?? 0)
  const shrink = items.map(it => it.shrink ?? 1)
  const min = items.map(it => it.min ?? 0)
  const max = items.map(it => it.max ?? null)
  const main = items.map(it => it.base)
  const sumBase = main.reduce((a, b) => a + b, 0)
  const freePre = content - sumBase - totalGap
  const sumGrow = grow.reduce((a, b) => a + b, 0)
  if (freePre > 0 && sumGrow > 0) {
    for (let i = 0; i < n; i++) main[i] = items[i].base + freePre * grow[i] / sumGrow
  } else if (freePre < 0) {
    // Split the deficit among the still-free items, weighted by shrink*base; an item
    // that would cross its own [min,max] freezes at that bound and leaves the split;
    // the deficit left over goes back to the free items on the next round.
    const frozen = new Array<boolean>(n).fill(false)
    let deficit = freePre
    for (;;) {
      let weighted = 0
      for (let i = 0; i < n; i++) if (!frozen[i]) weighted += shrink[i] * items[i].base
      if (weighted <= 0 || deficit >= -0.01) break
      let newlyFrozen = false
      for (let i = 0; i < n; i++) {
        if (frozen[i]) continue
        const proposed = items[i].base + deficit * (shrink[i] * items[i].base) / weighted
        if (proposed <= min[i]) { main[i] = min[i]; frozen[i] = true; newlyFrozen = true }
        else if (max[i] != null && proposed >= max[i]!) { main[i] = max[i]!; frozen[i] = true; newlyFrozen = true }
        else main[i] = proposed
      }
      if (!newlyFrozen) break
      let frozenSum = 0, freeBaseSum = 0
      for (let i = 0; i < n; i++) { if (frozen[i]) frozenSum += main[i]; else freeBaseSum += items[i].base }
      deficit = Math.min(content - totalGap - frozenSum - freeBaseSum, 0)
      if (deficit >= -0.01) break
    }
  }
  return main.map((m, i) => clampFinal(m, min[i], max[i]))
}

export interface LineItem {
  main: number            // border-box size on the main axis
  cross: number           // border-box size on the cross axis
  grow?: number
  shrink?: number
  min?: number | null     // border-box floor on the main axis
  max?: number | null     // border-box ceiling on the main axis
  margin?: number         // all four sides (px)
  marginMainStart?: number; marginMainEnd?: number
  marginCrossStart?: number; marginCrossEnd?: number
  autoMainStart?: boolean; autoMainEnd?: boolean     // `margin: auto` on the main axis
  autoCrossStart?: boolean; autoCrossEnd?: boolean   // `margin: auto` on the cross axis
}
export interface LineOpts {
  track?: number | null   // declared main content size (a MINIMUM), undefined = auto
  cross?: number | null   // declared cross content size (a MINIMUM), undefined = auto
  gap?: number
  justify?: Justify
  align?: Align
}
export interface LinePos { main: number; cross: number; size: number }
export interface LineResult { items: LinePos[]; used: { main: number; cross: number } }

/** Lay one flex line out. Positions are each item's BORDER-BOX start (margins outside)
 *  relative to the container's content-box origin, in CSS space. */
export function layoutLine(items: LineItem[], opts: LineOpts): LineResult {
  const n = items.length
  const gap = opts.gap ?? 0
  const totalGap = Math.max(n - 1, 0) * gap
  const side = (it: LineItem, v: number | undefined, auto: boolean | undefined) => auto ? 0 : (v ?? it.margin ?? 0)
  const mStart = items.map(it => side(it, it.marginMainStart, it.autoMainStart))
  const mEnd = items.map(it => side(it, it.marginMainEnd, it.autoMainEnd))
  const cStart = items.map(it => side(it, it.marginCrossStart, it.autoCrossStart))
  const cEnd = items.map(it => side(it, it.marginCrossEnd, it.autoCrossEnd))

  // main axis — sizes are OUTER (border-box + margins), like rts-dom's FlexItem.base.
  const baseOuter = items.map((it, i) => it.main + mStart[i] + mEnd[i])
  const sumBase = baseOuter.reduce((a, b) => a + b, 0) + totalGap
  let outer: number[]
  let track: number
  if (opts.track != null) {
    track = Math.max(opts.track, sumBase)   // fixed = minimum: grow to fit, never clip
    outer = resolveMainSizes(items.map((it, i) => ({
      base: baseOuter[i], grow: it.grow, shrink: it.shrink,
      min: (it.min ?? 0) + mStart[i] + mEnd[i],
      max: it.max != null ? it.max + mStart[i] + mEnd[i] : null,
    })), track, gap)
  } else {
    track = sumBase
    outer = baseOuter
  }
  const sumOuter = outer.reduce((a, b) => a + b, 0) + totalGap
  const free = track - sumOuter
  const autoCount = items.reduce((c, it) => c + (it.autoMainStart ? 1 : 0) + (it.autoMainEnd ? 1 : 0), 0)
  let leading = 0, between = 0
  if (free > 0 && autoCount > 0) {
    // auto margins absorb the free space BEFORE justify-content (Flexbox §8.1)
    const share = free / autoCount
    for (let i = 0; i < n; i++) {
      if (items[i].autoMainStart) { mStart[i] += share; outer[i] += share }
      if (items[i].autoMainEnd) { mEnd[i] += share; outer[i] += share }
    }
  } else {
    [leading, between] = justifyOffsets(opts.justify ?? 'start', free, n)
  }

  // cross axis
  const outerCross = items.map((it, i) => it.cross + cStart[i] + cEnd[i])
  const line = Math.max(opts.cross ?? 0, ...outerCross, 0)

  const out: LinePos[] = []
  let cursor = leading
  for (let i = 0; i < n; i++) {
    const size = outer[i] - mStart[i] - mEnd[i]
    const off = autoMarginCross(!!items[i].autoCrossStart, !!items[i].autoCrossEnd, line, outerCross[i])
      ?? alignOffset(opts.align ?? 'start', line, outerCross[i])
    out.push({ main: cursor + mStart[i], cross: off + cStart[i], size })
    cursor += outer[i] + gap + between
  }
  return { items: out, used: { main: track, cross: line } }
}

export interface LinesOpts extends LineOpts {
  wrap?: boolean            // flex-wrap: wrap — needs a track; without one nothing wraps
  row_gap?: number          // gap between lines (cross axis)
  align_content?: Justify | 'stretch' | (string & {})   // default: stretch when `cross` is fixed
}
export interface LinesResult extends LineResult { lines: number }

/** Multi-line flex (flex-wrap: wrap). Items break into lines greedily by the track
 *  (an item wider than the track gets its own line — never clipped), each line is laid
 *  out by layoutLine, then the lines are placed on the cross axis by `align_content`
 *  (rts-dom `flex_linhas.rs`: `justify_offsets` reused for the line block; `stretch`
 *  splits the free cross space between the lines). Positions stay in item order. */
export function layoutLines(items: LineItem[], opts: LinesOpts): LinesResult {
  if (!opts.wrap || opts.track == null) {
    const r = layoutLine(items, opts)
    return { ...r, lines: 1 }
  }
  const track = opts.track
  const gap = opts.gap ?? 0
  const rowGap = opts.row_gap ?? 0
  const side = (it: LineItem, v: number | undefined, auto: boolean | undefined) => auto ? 0 : (v ?? it.margin ?? 0)
  const outer = (it: LineItem) => it.main + side(it, it.marginMainStart, it.autoMainStart) + side(it, it.marginMainEnd, it.autoMainEnd)

  // 1) break into lines
  const lines: LineItem[][] = []
  let cur: LineItem[] = [], curW = 0
  for (const it of items) {
    const o = outer(it)
    if (cur.length > 0 && curW + gap + o > track) { lines.push(cur); cur = []; curW = 0 }
    curW += (cur.length > 0 ? gap : 0) + o
    cur.push(it)
  }
  if (cur.length) lines.push(cur)
  const n = lines.length

  // 2) each line on its own (fixed track, auto cross)
  const lineOpts: LineOpts = { track, gap, justify: opts.justify, align: opts.align }
  let results = lines.map(li => layoutLine(li, lineOpts))
  const lineCross = results.map(r => r.used.cross)
  const totalCross = lineCross.reduce((a, b) => a + b, 0) + rowGap * Math.max(n - 1, 0)

  // 3) place the lines on the cross axis
  let leading = 0, between = 0, extra = 0
  if (opts.cross != null) {
    const free = opts.cross - totalCross
    const ac = opts.align_content ?? 'stretch'
    if (ac === 'stretch') extra = Math.max(free, 0) / n
    else [leading, between] = justifyOffsets(ac, free, n)
  }
  const out: LinePos[] = []
  let y = leading
  let usedMain = track
  for (let i = 0; i < n; i++) {
    const lc = lineCross[i] + extra
    // a stretched line re-lays its items so `align` applies inside the taller line
    const r = extra > 0 ? layoutLine(lines[i], { ...lineOpts, cross: lc }) : results[i]
    for (const p of r.items) out.push({ main: p.main, cross: y + p.cross, size: p.size })
    usedMain = Math.max(usedMain, r.used.main)
    y += lc + rowGap + between
  }
  const usedCross = opts.cross != null ? Math.max(opts.cross, totalCross) : totalCross
  return { items: out, used: { main: usedMain, cross: usedCross }, lines: n }
}

/** CSS top-left box (x,y,w,h) inside a W×H container centered at the origin → the DST
 *  widget CENTER (DST widgets are centered on their own origin and y grows UP). */
export function toDst(x: number, y: number, w: number, h: number, W: number, H: number): [number, number] {
  return [x - W / 2 + w / 2, H / 2 - y - h / 2]
}
