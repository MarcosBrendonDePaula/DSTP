// Behavioral test for the draggable panel (#16 extension): a panel node with
// draggable=true gets a title-bar hit target; mouse-down starts a per-frame OnUpdate
// that moves the panel by the cursor delta, mouse-up stops it. Runs the REAL
// ui_widgets.lua under fengari with a controllable mock cursor. The actual feel/drag is
// in-game-only, but the wiring (handlers, delta movement, start/stop) is tested here.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { runLuaHarness, modSource } from './mod-test-kit'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('mod ui_widgets.lua — draggable panel window (#16)', () => {
  it('title-bar drag moves the panel by the cursor delta and stops on release', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-drag-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
