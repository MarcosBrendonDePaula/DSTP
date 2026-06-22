// Mirror-test for NormalizeElement in ui_widgets.lua: the element model
// ({tag, style, children}) → legacy node shape the renderer already understands.
// The Lua fn is a local; this faithful port pins the mapping (the spec). See
// DST_MOD/specs/ui-element-model.md. Legacy nodes (no `tag`) pass through untouched.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'

const DISPLAY_TO_LEGACY: Record<string, { type: string; mode?: string }> = {
  flex: { type: 'col' },
  grid: { type: 'col', mode: 'grid' },
  block: { type: 'col' },
  absolute: { type: 'panel', mode: 'canvas' },
}

function normalizeElement(node: any): any {
  if (typeof node !== 'object' || node == null || node.tag == null) return node
  const st = node.style || {}
  const out: any = {}
  for (const k of Object.keys(node)) if (k !== 'tag' && k !== 'style') out[k] = node[k]
  out.width = st.width; out.height = st.height
  out.width_ref = st.width_ref; out.height_ref = st.height_ref
  out.gap = st.gap; out.scale = st.scale
  out.x = st.x; out.y = st.y
  if (st.color != null) out.color = st.color
  if (node.tag === 'div') {
    const disp = st.display || 'flex'
    const map = DISPLAY_TO_LEGACY[disp] || DISPLAY_TO_LEGACY.flex
    out.type = map.type
    if (map.mode) out.mode = map.mode
    if (disp === 'flex' && st.direction === 'row') out.type = 'row'
    if (disp === 'grid' && st.cols) out.cols = st.cols
    if (disp === 'grid' && st.grid_template) out.grid_rows = st.grid_template
  } else {
    out.type = node.tag === 'input' ? 'text_input' : node.tag
  }
  return out
}

describe('NormalizeElement (element model → legacy)', () => {
  it('passes a legacy node through untouched', () => {
    const legacy = { type: 'col', gap: 8, children: [] }
    expect(normalizeElement(legacy)).toBe(legacy)
  })

  it('div flex column → col', () => {
    const n = normalizeElement({ tag: 'div', style: { display: 'flex', direction: 'column', gap: 8 } })
    expect(n.type).toBe('col'); expect(n.gap).toBe(8)
  })

  it('div flex row → row', () => {
    expect(normalizeElement({ tag: 'div', style: { display: 'flex', direction: 'row' } }).type).toBe('row')
  })

  it('div grid → col + mode grid + cols', () => {
    const n = normalizeElement({ tag: 'div', style: { display: 'grid', cols: 3 } })
    expect(n.type).toBe('col'); expect(n.mode).toBe('grid'); expect(n.cols).toBe(3)
  })

  it('div absolute → panel + mode canvas', () => {
    const n = normalizeElement({ tag: 'div', style: { display: 'absolute', width: 300, height: 200 } })
    expect(n.type).toBe('panel'); expect(n.mode).toBe('canvas'); expect(n.width).toBe(300)
  })

  it('div with no display defaults to flex/col', () => {
    expect(normalizeElement({ tag: 'div', style: {} }).type).toBe('col')
  })

  it('leaf tags map 1:1 (input → text_input)', () => {
    expect(normalizeElement({ tag: 'text', text: 'hi' }).type).toBe('text')
    expect(normalizeElement({ tag: 'button', callback: 'x' }).type).toBe('button')
    expect(normalizeElement({ tag: 'input', placeholder: 'p' }).type).toBe('text_input')
  })

  it('moves style box-model fields to flat props', () => {
    const n = normalizeElement({ tag: 'button', text: 'Buy', callback: 'buy', style: { width: '50%', width_ref: 'panel', height: 44, scale: 1.2 } })
    expect(n.width).toBe('50%'); expect(n.width_ref).toBe('panel'); expect(n.height).toBe(44); expect(n.scale).toBe(1.2)
    expect(n.text).toBe('Buy'); expect(n.callback).toBe('buy') // content props preserved
  })

  it('preserves children + id + callback', () => {
    const n = normalizeElement({ tag: 'div', id: 'shop', callback: 'c', style: {}, children: [1, 2] })
    expect(n.id).toBe('shop'); expect(n.callback).toBe('c'); expect(n.children).toEqual([1, 2])
  })
})
