// Behavioral test for the text_input tree node (editable HUD field). Runs the REAL
// ui_widgets.lua under fengari with a TextEdit stub: asserts the node enables the HUD
// keyboard grab (SetForceEdit), starts editing on click, fires the ui_callback with the
// typed string as payload on Enter, clears on submit, and accepts a backend SetProps.
// The actual keyboard capture / WASD suppression is in-game-only (engine input routing).
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { runLuaHarness, modSource } from './mod-test-kit'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('mod ui_widgets.lua — text_input editable field', () => {
  it('builds a force-edit TextEdit, click→edit, Enter→ui_callback with the typed value', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-textinput-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
