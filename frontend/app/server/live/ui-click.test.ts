// Behavioral test for the #16 click fix: a text/icon/image tree node carrying a
// `callback` becomes clickable via a transparent ImageButton overlay (DST's own
// pattern, widget.lua:757-760) wired to ctx.callback_fn(cb, root_id) with a 0.5s
// debounce — replacing the broken OnControl/SetClickable path that never fired on the
// non-focusable HUD. Runs the REAL ui_widgets.lua under fengari with recording widget
// stubs. Plus a structural pin that the old OnControl/SetClickable wiring is gone.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — clickable text/icon/image via ImageButton overlay (#16)', () => {
  it('wraps a callback node in a transparent ImageButton, click fires ctx.callback_fn (debounced)', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-click-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod ui_widgets.lua — old broken click path removed (#16)', () => {
  const ui = modSource('ui_widgets.lua')
  it('MaybeClickable no longer wires OnControl + SetClickable on bare widgets', () => {
    // The fix replaces the OnControl override / SetClickable(true) with an ImageButton
    // overlay. Those two lines must be gone from the helper.
    expect(ui).not.toContain('widget.OnControl = function')
    expect(ui).not.toContain('widget:SetClickable(true)')
  })
  it('MaybeClickable uses the transparent ImageButton overlay pattern', () => {
    expect(ui).toContain('"images/ui.xml", "blank.tex"')
    expect(ui).toContain('ScaleToSize')
    expect(ui).toContain('SetOnClick')
  })
})
