// Behavioral + structural tests for the #16 phase-2 fold: the legacy flat builders
// (label/panel/button/progress_bar) are now thin adapters that build a one-node tree
// and render through the SAME RenderNode as the tree path — no duplicated draw code —
// while keeping the flat create/update action surface (saved flows unchanged).
// notification + follow stay as dedicated builders.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — flat builders folded into the tree renderer (#16 phase 2)', () => {
  it('label/button/bar/panel route through RenderNode; UpdateFlat patches in place', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-fold-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod ui_widgets.lua — no duplicated draw code after the fold (#16 phase 2)', () => {
  const ui = modSource('ui_widgets.lua')

  // The carny-button construction and the fepanel bg must appear ONLY in RenderNode,
  // not in the (now-adapter) flat builders. We assert each draw signature appears
  // exactly once (the RenderNode branch). The folded builders are ~5-line adapters.
  const count = (needle: string) => ui.split(needle).length - 1

  it('the carny ImageButton lives only in RenderNode (tabs + button), not in the flat builders', () => {
    // Two legitimate uses, both inside RenderNode: the `tabs` tab-bar and the `button`
    // node. The folded CreateButton no longer builds its own — it's an adapter.
    expect(count('button_carny_long_normal.tex')).toBe(2)
    // And the folded button builder is a one-liner delegating to FlatAdapter (no draw).
    const createButton = ui.slice(ui.indexOf('local function CreateButton(cmd)'))
      .slice(0, ui.slice(ui.indexOf('local function CreateButton(cmd)')).indexOf('\nend') + 4)
    expect(createButton).not.toContain('button_carny_long_normal.tex')
    expect(createButton).toContain('FlatAdapter(cmd, "button"')
  })

  it('the fepanel panel background is constructed once (only in RenderNode panel)', () => {
    // legacy CreatePanel used to build its own fepanel bg+border; now only RenderNode does.
    // RenderNode builds bg + border (2 Image("...panel_fill_tiny.tex")) in one branch.
    expect(count('panel_fill_tiny.tex')).toBe(2) // bg + border, both in RenderNode panel
  })

  it('the flat builders are adapters that call the shared FlatAdapter helper', () => {
    expect(ui).toContain('local function FlatAdapter(cmd, entry_type, node)')
    // each folded builder delegates to FlatAdapter
    expect(count('return FlatAdapter(cmd,')).toBe(4) // label, panel, button, progress_bar
  })

  it('notification stays a dedicated builder (tween + auto-dismiss have no tree node)', () => {
    expect(ui).toContain('local function CreateNotification(cmd)')
    expect(ui).toContain('DoTaskInTime') // the auto-dismiss timer is kept
  })

  it('the flat create/update action surface is preserved (CREATORS/UPDATERS keys)', () => {
    for (const key of ['notification', 'label', 'panel', 'button', 'progress_bar']) {
      expect(ui).toContain(`${key.padEnd(12)} =`)
    }
  })
})
