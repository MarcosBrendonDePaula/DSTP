// Mirror-test for the percent-size resolution in the mod's ui_widgets.lua ResolveSize.
// The Lua function is a local (not exported), so we replicate its exact logic here and
// pin the math + the reference rules. If the Lua formula changes, update both — the
// cases below ARE the spec: "50%" of a reference of known size; plain px passes through;
// an unknown/auto-size reference returns null so the renderer keeps its pixel default.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'

const RES_X = 1280, RES_Y = 720

// Faithful port of ResolveSize(value, ref, ctx, dim).
function resolveSize(
  value: any, ref: string | undefined,
  ctx: { panel_w?: number | null; panel_h?: number | null; parent_w?: number | null; parent_h?: number | null },
  dim: 'w' | 'h',
): number | null {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isNaN(n) && String(value).trim() !== '' && !String(value).includes('%')) return n
  const m = String(value).match(/^\s*(-?\d+\.?\d*)\s*%\s*$/)
  if (!m) return null
  const pct = Number(m[1])
  const r = (ref || 'parent').toLowerCase()
  let base: number | null | undefined
  if (r === 'screen') base = dim === 'w' ? RES_X : RES_Y
  else if (r === 'panel') base = dim === 'w' ? ctx.panel_w : ctx.panel_h
  else if (r === 'parent') base = dim === 'w' ? ctx.parent_w : ctx.parent_h
  if (!base || base <= 0) return null
  return (base * pct) / 100
}

describe('percent size resolution (mirrors ui_widgets.lua ResolveSize)', () => {
  const ctx = { panel_w: 400, panel_h: 200, parent_w: 400, parent_h: 200 }

  it('plain pixels pass through', () => {
    expect(resolveSize(120, undefined, ctx, 'w')).toBe(120)
    expect(resolveSize('64', undefined, ctx, 'h')).toBe(64)
  })

  it('percent of the screen', () => {
    expect(resolveSize('50%', 'screen', ctx, 'w')).toBe(640)   // 50% of 1280
    expect(resolveSize('25%', 'screen', ctx, 'h')).toBe(180)   // 25% of 720
  })

  it('percent of the panel (when panel has a fixed size)', () => {
    expect(resolveSize('50%', 'panel', ctx, 'w')).toBe(200)    // 50% of 400
    expect(resolveSize('10%', 'panel', ctx, 'h')).toBe(20)     // 10% of 200
  })

  it('defaults the reference to the PARENT when omitted', () => {
    expect(resolveSize('100%', undefined, ctx, 'w')).toBe(400)  // parent_w, not screen
    expect(resolveSize('50%', undefined, ctx, 'h')).toBe(100)   // 50% of parent_h 200
  })

  it('returns null when the reference has no known size (renderer keeps its default)', () => {
    const noPanel = { panel_w: null, panel_h: null, parent_w: null, parent_h: null }
    expect(resolveSize('50%', 'panel', noPanel, 'w')).toBeNull()
    expect(resolveSize('50%', 'parent', noPanel, 'h')).toBeNull()
  })

  it('returns null for a non-percent, non-number string', () => {
    expect(resolveSize('auto', 'screen', ctx, 'w')).toBeNull()
    expect(resolveSize('', 'screen', ctx, 'w')).toBeNull()
  })

  it('handles fractional percents', () => {
    expect(resolveSize('12.5%', 'screen', ctx, 'w')).toBe(160) // 12.5% of 1280
  })
})
