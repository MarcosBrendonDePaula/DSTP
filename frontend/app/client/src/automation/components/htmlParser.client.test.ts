// HTML → UI tree parser tests (jsdom for DOMParser).
// Run: vitest run --config vitest.client.config.ts
import { describe, it, expect } from 'vitest'
import { htmlToTree, treeToHtml } from './htmlParser'
import { normalizeElement } from './elementModel'

describe('htmlToTree', () => {
  it('parses a div with style into tag + style', () => {
    const t = htmlToTree('<div style="display:flex; gap:8; width:60%"></div>')
    expect(t.tag).toBe('div')
    expect(t.style.display).toBe('flex')
    expect(t.style.gap).toBe(8)        // numeric style coerced
    expect(t.style.width).toBe('60%')  // percent stays string
  })

  it('parses a color attr/style as [r,g,b,a]', () => {
    const t = htmlToTree('<div style="background:0.1,0.2,0.3,1"></div>')
    expect(t.style.background).toEqual([0.1, 0.2, 0.3, 1])
  })

  it('text leaf: inner text → text prop', () => {
    const t = htmlToTree('<text size="24" color="1,1,0.8,1">Loja</text>')
    expect(t.tag).toBe('text')
    expect(t.text).toBe('Loja')
    expect(t.size).toBe(24)
    expect(t.color).toEqual([1, 1, 0.8, 1])
  })

  it('nests children', () => {
    const t = htmlToTree('<div><text>A</text><button callback="buy">Comprar</button></div>')
    expect(t.children).toHaveLength(2)
    expect(t.children[0].tag).toBe('text')
    expect(t.children[0].text).toBe('A')
    expect(t.children[1].tag).toBe('button')
    expect(t.children[1].callback).toBe('buy')
    expect(t.children[1].text).toBe('Comprar')
  })

  it('a parsed div normalizes to a legacy col (flex column default)', () => {
    const t = htmlToTree('<div style="display:flex; flex-direction:column"></div>')
    // direction in HTML is flex-direction; map it
    const norm = normalizeElement({ ...t, style: { ...t.style, direction: t.style['flex-direction'] || t.style.direction } })
    expect(['col', 'row']).toContain(norm.type)
  })

  it('round-trips tree → html → tree (shape preserved)', () => {
    const html = '<div style="display:flex; gap:8"><text>Hi</text></div>'
    const tree = htmlToTree(html)
    const back = htmlToTree(treeToHtml(tree))
    expect(back.tag).toBe('div')
    expect(back.children[0].text).toBe('Hi')
    expect(back.style.gap).toBe(8)
  })

  it('maps semantic tags (h1/strong/span/p) to text with a size', () => {
    expect(htmlToTree('<h1>Título</h1>')).toMatchObject({ tag: 'text', size: 36, text: 'Título' })
    expect(htmlToTree('<h3>Sub</h3>').size).toBe(26)
    expect(htmlToTree('<strong>x</strong>')).toMatchObject({ tag: 'text', bold: true })
    expect(htmlToTree('<span>y</span>').tag).toBe('text')
    expect(htmlToTree('<small>z</small>').size).toBe(13)
  })

  it('maps section/img/ul to div/image/div', () => {
    expect(htmlToTree('<section></section>').tag).toBe('div')
    expect(htmlToTree('<img tex="square.tex"/>').tag).toBe('image')
  })

  it('explicit attr overrides the alias default size', () => {
    expect(htmlToTree('<h1 size="50">Big</h1>').size).toBe(50)
  })

  it('coerces "true"/"false" attributes to booleans (closeable="false" must not be a truthy string)', () => {
    const t = htmlToTree('<panel title="Loja" closeable="false" draggable="true"><text>x</text></panel>')
    expect(t.closeable).toBe(false)
    expect(t.draggable).toBe(true)
  })

  it('<tabs>: children with tab_label become tabs[{label, child}] (what the renderer reads)', () => {
    const t = htmlToTree('<tabs><div tab_label="Comprar"><text>a</text></div><div tab_label="Vender"><text>b</text></div></tabs>')
    expect(t.tag).toBe('tabs')
    expect(t.children).toBeUndefined()
    expect(t.tabs).toHaveLength(2)
    expect(t.tabs[0].label).toBe('Comprar')
    expect(t.tabs[0].child.tag).toBe('div')
    expect(t.tabs[1].label).toBe('Vender')
    expect(t.tabs[1].child.children[0].text).toBe('b')
  })

  it('round-trips tabs: tree → html → tree keeps the tab labels', () => {
    const tree = { tag: 'tabs', tabs: [{ label: 'A', child: { tag: 'div', children: [{ tag: 'text', text: 'a' }] } }, { label: 'B', child: { tag: 'div', children: [{ tag: 'text', text: 'b' }] } }] }
    const html = treeToHtml(tree)
    expect(html).toContain('tab_label="A"')
    const back = htmlToTree(html)
    expect(back.tabs.map((t: any) => t.label)).toEqual(['A', 'B'])
  })

  it('flat size attrs survive normalization when style lacks them (<panel width="200">)', () => {
    const t = normalizeElement(htmlToTree('<panel title="Carteira" width="200" height="84" gap="8"><text>x</text></panel>'))
    expect(t.type).toBe('panel')
    expect(t.width).toBe(200)
    expect(t.height).toBe(84)
    expect(t.gap).toBe(8)
    // and style still wins over a flat attr
    const s = normalizeElement(htmlToTree('<div width="10" style="width:300"></div>'))
    expect(s.width).toBe('300')
  })

  it('border style forms → { width, color } (the renderer\'s shape)', () => {
    expect(htmlToTree('<div style="border:2 1,0,0,1"></div>').style.border).toEqual({ width: 2, color: [1, 0, 0, 1] })
    expect(htmlToTree('<div style="border:3"></div>').style.border).toEqual({ width: 3 })
    expect(htmlToTree('<div style="border-width:2; border-color:0,1,0,1"></div>').style.border).toEqual({ width: 2, color: [0, 1, 0, 1] })
    // normalizes to the flat prop the Lua AddBox reads
    expect(normalizeElement(htmlToTree('<div style="border:2 1,0,0,1"></div>')).border).toEqual({ width: 2, color: [1, 0, 0, 1] })
  })

  it('flex-wrap / align-content / row-gap map to wrap / align_content / row_gap', () => {
    const t = htmlToTree('<div style="display:flex; direction:row; flex-wrap:wrap; align-content:center; row-gap:6"></div>')
    expect(t.style.wrap).toBe(true)
    expect(t.style.align_content).toBe('center')
    expect(t.style.row_gap).toBe(6)
    const n = normalizeElement(t)
    expect(n.type).toBe('row'); expect(n.wrap).toBe(true); expect(n.align_content).toBe('center'); expect(n.row_gap).toBe(6)
    expect(htmlToTree('<div style="flex-wrap:nowrap"></div>').style.wrap).toBe(false)
  })

  it('text-align / font / line-height map to halign / font / line_height on a text', () => {
    const t = htmlToTree('<text style="text-align:right; font:title; line-height:1.4; width:200">Titulo</text>')
    expect(t.style.halign).toBe('right')
    expect(t.style.font).toBe('title')
    expect(t.style.line_height).toBe(1.4)
    const n = normalizeElement(t)
    expect(n.type).toBe('text'); expect(n.halign).toBe('right'); expect(n.font).toBe('title'); expect(n.width).toBe('200')
  })

  it('throws on empty input', () => {
    expect(() => htmlToTree('')).toThrow()
  })
})
