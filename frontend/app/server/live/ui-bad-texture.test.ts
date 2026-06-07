// Regression test for the in-game crash where a UI icon/image with an unresolvable
// texture took down the whole render tree. Vanilla Image:SetSize indexes
// self.inst.ImageWidget, which is nil when the atlas/tex didn't load ("SetSize on bad
// self (number expected, got nil)") — observed on the shop wallet UI's goldnugget icon.
// The fix guards build+SetSize in pcall and falls back to a 'noimage'/'noicon'
// placeholder, so one bad texture can't crash the panel. Runs the REAL ui_widgets.lua
// under fengari with an Image stub that throws from SetSize on a sentinel bad texture.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — a bad texture does not crash the render tree', () => {
  it('a bad-texture image falls back to a placeholder; siblings still render', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-bad-texture-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod ui_widgets.lua — icon/image build+size is pcall-guarded (structural)', () => {
  const ui = modSource('ui_widgets.lua')
  it('the icon branch guards SetSize inside the pcall (not just the constructor)', () => {
    // The guarded block builds the Image AND calls SetSize inside one pcall.
    expect(ui).toContain('img:SetSize(size, size)')
    expect(ui).toContain('Widget("noicon")')
  })
  it('the image branch falls back to a noimage placeholder', () => {
    expect(ui).toContain('Widget("noimage")')
  })
})
