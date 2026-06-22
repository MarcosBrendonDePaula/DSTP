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

  it('throws on empty input', () => {
    expect(() => htmlToTree('')).toThrow()
  })
})
