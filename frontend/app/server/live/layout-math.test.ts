// The flex arithmetic ported from rts-dom, proven identical in BOTH implementations:
//   - DST_MOD/scripts/dstp/layout_math.lua  (the game; run REAL under fengari)
//   - app/shared/automation/layoutMath.ts   (the panel preview/editor)
// One fixture table (app/shared/automation/layout-math-fixtures.json) drives both, so a
// number that drifts on either side fails here — the preview and the game can never
// silently disagree on where a child lands.
//
// Space convention (same as CSS and rts-dom): origin top-left, y grows DOWN. `toDst`
// is the ONE conversion to DST's centered, y-up widget space.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { runLuaHarness, modSource } from './mod-test-kit'
import fixtures from '../../shared/automation/layout-math-fixtures.json'
import * as LM from '../../shared/automation/layoutMath'

const close = (a: number | null | undefined, b: number | null | undefined) => {
  if (a == null || b == null) return a == null && b == null
  return Math.abs(a - b) < 0.01
}

// JSON → Lua table literal (null/_doc dropped: a Lua "absent key" is nil).
function toLua(v: any): string {
  if (v === null || v === undefined) return 'nil'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return '{' + v.map(toLua).join(',') + '}'
  return '{' + Object.entries(v)
    .filter(([k, x]) => k !== '_doc' && x !== null && x !== undefined)
    .map(([k, x]) => `[${JSON.stringify(k)}]=${toLua(x)}`).join(',') + '}'
}

describe('layoutMath.ts (panel side) matches the shared fixtures', () => {
  it('justifyOffsets', () => {
    for (const f of fixtures.justify_offsets) {
      const [leading, between] = LM.justifyOffsets(f.justify, f.free, f.n)
      expect([f.justify, f.free, leading, between]).toEqual([f.justify, f.free, f.leading, f.between])
    }
  })
  it('alignOffset', () => {
    for (const f of fixtures.align_offset) expect(LM.alignOffset(f.align, f.line, f.item)).toBe(f.offset)
  })
  it('autoMarginCross', () => {
    for (const f of fixtures.auto_margin_cross) expect(LM.autoMarginCross(f.autoStart, f.autoEnd, f.line, f.item)).toBe(f.offset)
  })
  it('clampFinal', () => {
    for (const f of fixtures.clamp_final) expect(LM.clampFinal(f.main, f.min, f.max)).toBe(f.out)
  })
  it('resolveMainSizes', () => {
    for (const f of fixtures.resolve_main_sizes) {
      const out = LM.resolveMainSizes(f.items as any, f.content, f.gap)
      expect(out.map(n => Math.round(n * 100) / 100)).toEqual(f.main)
    }
  })
  it('layoutLine', () => {
    for (const f of fixtures.layout_line) {
      const r = LM.layoutLine(f.items as any, f.opts as any)
      const got = r.items.map(p => ({ main: p.main, cross: p.cross, size: p.size }))
      expect({ name: f.name, pos: got, used: r.used }).toEqual({ name: f.name, pos: f.pos, used: f.used })
    }
  })
  it('toDst', () => {
    for (const f of fixtures.to_dst) expect(LM.toDst(f.x, f.y, f.w, f.h, f.W, f.H)).toEqual([f.dx, f.dy])
  })
})

describe('layout_math.lua (game side) matches the SAME fixtures under fengari', () => {
  it('every fixture group passes in Lua', () => {
    const harness = `
      local F = KIT.load(MOD_FIXTURES, "fixtures")
      local LM = KIT.load(MOD_LAYOUT_MATH, "layout_math.lua")
      local C = KIT.new_checker(); local check = C.check
      local function close(a, b)
        if a == nil or b == nil then return a == nil and b == nil end
        return math.abs(a - b) < 0.01
      end
      for i, f in ipairs(F.justify_offsets) do
        local l, b = LM.JustifyOffsets(f.justify, f.free, f.n)
        check("justify#" .. i .. " " .. f.justify .. " free=" .. f.free .. " got " .. tostring(l) .. "," .. tostring(b), close(l, f.leading) and close(b, f.between))
      end
      for i, f in ipairs(F.align_offset) do
        check("align#" .. i, close(LM.AlignOffset(f.align, f.line, f.item), f.offset))
      end
      for i, f in ipairs(F.auto_margin_cross) do
        check("automargin#" .. i, close(LM.AutoMarginCross(f.autoStart, f.autoEnd, f.line, f.item), f.offset))
      end
      for i, f in ipairs(F.clamp_final) do
        check("clamp#" .. i, close(LM.ClampFinal(f.main, f.min, f.max), f.out))
      end
      for i, f in ipairs(F.resolve_main_sizes) do
        local out = LM.ResolveMainSizes(f.items, f.content, f.gap)
        local ok = #out == #f.main
        for j = 1, #f.main do if not close(out[j], f.main[j]) then ok = false end end
        check("mainsizes#" .. i .. " got " .. table.concat(out, ","), ok)
      end
      for i, f in ipairs(F.layout_line) do
        local r = LM.LayoutLine(f.items, f.opts)
        local ok = #r.items == #f.pos and close(r.used.main, f.used.main) and close(r.used.cross, f.used.cross)
        local got = {}
        for j, p in ipairs(f.pos) do
          local g = r.items[j] or {}
          got[#got+1] = string.format("(%s,%s,%s)", tostring(g.main), tostring(g.cross), tostring(g.size))
          if not (g and close(g.main, p.main) and close(g.cross, p.cross) and close(g.size, p.size)) then ok = false end
        end
        check("line#" .. i .. " " .. f.name .. " got " .. table.concat(got, " ") .. " used=" .. tostring(r.used.main) .. "x" .. tostring(r.used.cross), ok)
      end
      for i, f in ipairs(F.to_dst) do
        local dx, dy = LM.ToDst(f.x, f.y, f.w, f.h, f.W, f.H)
        check("todst#" .. i, close(dx, f.dx) and close(dy, f.dy))
      end
      return C.report()
    `
    const result = runLuaHarness({
      modules: {
        LAYOUT_MATH: modSource('layout_math.lua'),
        FIXTURES: 'return ' + toLua(fixtures),
      },
      harness,
    })
    expect(result).toBe('OK')
  })
})
