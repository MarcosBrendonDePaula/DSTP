// Layout-rule tests: run the REAL ui_widgets.lua RenderNode/LayoutChildren under fengari
// and assert the COMPUTED box sizes for a known tree, so the CSS-like rules (flex stack,
// padding, percent width via parent ref, fixed-size-as-min grow) are pinned in CI rather
// than eyeballed in-game. This is the "are we interpreting the style rules correctly?"
// safety net.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — layout/style rules produce correct box sizes', () => {
  it('percent width resolves to the parent (not the screen); fixed size is a minimum that grows', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-layout-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
