// HTML ⇆ UI tree. Lets the author write the UI as HTML in the code editor; we parse it
// (browser DOMParser — robust, no fragile regex) into the element-model tree
// ({ tag, style, children }) that the renderer already understands, and back.
//
// Supported tags: div (container) + text/button/icon/image/bar/input/tabs (leaves).
// Attributes:
//   style="display:flex; gap:8; background:0.1,0.1,0.15,1; width:60%"  → style object
//   any other attr (text, size, color, callback, prefab, id, value, max, ...) → prop
//   inner text of a <text>/<button> → its `text` prop
// Colors are written as comma lists "r,g,b,a" (0..1) and parsed to [r,g,b,a].

type UINode = Record<string, any>

// style keys whose plain numeric values are coerced (percent strings stay strings)
const NUM_STYLE = new Set(['gap', 'padding', 'margin', 'opacity', 'scale', 'cols', 'x', 'y', 'z',
  'width', 'height', 'min_width', 'max_width', 'min_height', 'max_height', 'size', 'grow', 'shrink', 'flex'])
const COLOR_KEYS = new Set(['background', 'color', 'tint'])
const TEXT_TAGS = new Set(['text', 'button', 'input'])

// Semantic HTML tags → our base tags + default props. h1..h6/strong/b/em/i/p/span/small
// all become `text` (the only text leaf) with a sensible size/emphasis. Containers
// section/header/footer/main → div. Keeps authors writing real HTML.
const TAG_ALIAS: Record<string, { tag: string; props?: Record<string, any> }> = {
  h1: { tag: 'text', props: { size: 36 } },
  h2: { tag: 'text', props: { size: 30 } },
  h3: { tag: 'text', props: { size: 26 } },
  h4: { tag: 'text', props: { size: 22 } },
  h5: { tag: 'text', props: { size: 18 } },
  h6: { tag: 'text', props: { size: 15 } },
  p: { tag: 'text', props: { size: 18 } },
  span: { tag: 'text', props: { size: 18 } },
  small: { tag: 'text', props: { size: 13 } },
  strong: { tag: 'text', props: { size: 18, bold: true } },
  b: { tag: 'text', props: { size: 18, bold: true } },
  em: { tag: 'text', props: { size: 18 } },
  i: { tag: 'text', props: { size: 18 } },
  label: { tag: 'text', props: { size: 16 } },
  img: { tag: 'image' },
  section: { tag: 'div' }, header: { tag: 'div' }, footer: { tag: 'div' }, main: { tag: 'div' },
  ul: { tag: 'div', props: { style: { display: 'flex', direction: 'column', gap: 4 } } },
  li: { tag: 'text', props: { size: 16 } },
}

function parseColor(v: string): any {
  const parts = v.split(',').map(s => Number(s.trim()))
  return parts.length >= 3 && parts.every(n => !Number.isNaN(n)) ? parts : v
}

// "display:flex; gap:8; width:60%" → { display:'flex', gap:8, width:'60%' }
function parseStyle(s: string): UINode {
  const out: UINode = {}
  for (const decl of s.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const k = decl.slice(0, i).trim()
    let raw: any = decl.slice(i + 1).trim()
    if (!k || raw === '' || raw === 'undefined' || raw === 'null') continue
    if (COLOR_KEYS.has(k)) raw = parseColor(raw)
    else if (NUM_STYLE.has(k) && !raw.includes('%') && !Number.isNaN(Number(raw))) raw = Number(raw)
    out[k] = raw
  }
  // text: text-align → halign, vertical-align → valign (left/center/right, top/middle/
  // bottom — the renderer maps them to DST anchors), line-height → line_height.
  if (out['text-align'] != null) { out.halign = String(out['text-align']).trim(); delete out['text-align'] }
  if (out['vertical-align'] != null) { out.valign = String(out['vertical-align']).trim(); delete out['vertical-align'] }
  if (out['line-height'] != null) { const n = Number(out['line-height']); if (!Number.isNaN(n)) out.line_height = n; delete out['line-height'] }
  // CSS spellings → our props: flex-wrap → wrap (boolean), align-content, row-gap.
  if (out['flex-wrap'] != null) { out.wrap = String(out['flex-wrap']).trim() === 'wrap'; delete out['flex-wrap'] }
  if (out['align-content'] != null) { out.align_content = String(out['align-content']).trim(); delete out['align-content'] }
  if (out['row-gap'] != null) { const n = Number(out['row-gap']); if (!Number.isNaN(n)) out.row_gap = n; delete out['row-gap'] }
  // border → the renderer's { width, color } table. Forms: `border: 2 1,0,0,1`
  // (width then r,g,b,a), `border: 3` (width only, default colour), or the split
  // `border-width` / `border-color` keys.
  if (out.border != null || out['border-width'] != null || out['border-color'] != null) {
    const b: Record<string, any> = {}
    if (typeof out.border === 'string') {
      const [w, ...rest] = out.border.trim().split(/\s+/)
      if (!Number.isNaN(Number(w))) b.width = Number(w)
      if (rest.length) { const c = parseColor(rest.join('')); if (Array.isArray(c)) b.color = c }
    } else if (typeof out.border === 'number') b.width = out.border
    if (out['border-width'] != null && !Number.isNaN(Number(out['border-width']))) b.width = Number(out['border-width'])
    if (out['border-color'] != null) { const c = parseColor(String(out['border-color'])); if (Array.isArray(c)) b.color = c }
    delete out['border-width']; delete out['border-color']
    if (Object.keys(b).length) out.border = b; else delete out.border
  }
  return out
}

function elementToNode(el: Element): UINode {
  const raw = el.tagName.toLowerCase()
  const alias = TAG_ALIAS[raw]
  const tag = alias ? alias.tag : raw
  const node: UINode = { tag }
  // seed alias default props (size/bold/style) — explicit attrs below override.
  if (alias?.props) for (const [k, v] of Object.entries(alias.props)) node[k] = v
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name, val = attr.value
    if (val === '' || val === 'undefined' || val === 'null') continue  // ignore junk
    if (name === 'style') { const st = parseStyle(val); if (Object.keys(st).length) node.style = st; continue }
    if (COLOR_KEYS.has(name)) { node[name] = parseColor(val); continue }
    // booleans: closeable="false" / draggable="true" / password="true" must reach the
    // renderer as real booleans (Lua's `node.closeable ~= false` treats the STRING
    // "false" as truthy → the close button showed on an unclosable panel).
    if (val === 'true' || val === 'false') { node[name] = val === 'true'; continue }
    // numeric-ish bare attrs (size, width, height, value, max) stay strings unless clean numbers
    node[name] = (!val.includes('%') && !Number.isNaN(Number(val))) ? Number(val) : val
  }
  // children: element children → nodes; loose text between them → <text> children
  // (it used to be silently dropped); for text leaves, the inner text → `text` prop
  const childEls = Array.from(el.children)
  if (childEls.length) {
    const kids: UINode[] = []
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 1) kids.push(elementToNode(n as Element))
      else if (n.nodeType === 3 && tag !== 'tabs') {
        const txt = (n.textContent || '').trim()
        if (txt) kids.push({ tag: 'text', text: txt })
      }
    }
    if (tag === 'tabs') {
      // <tabs> authored as children (each tagged tab_label) → the renderer's shape:
      // tabs: [{ label, child }]. Without this a <tabs> in HTML rendered nothing.
      node.tabs = kids.map((c, i) => {
        const label = String(c.tab_label ?? c.title ?? `Aba ${i + 1}`)
        delete c.tab_label
        return { label, child: c }
      })
    } else {
      node.children = kids
    }
  } else if (TEXT_TAGS.has(tag)) {
    const txt = (el.textContent || '').trim()
    if (txt && node.text == null) node.text = txt
  }
  return node
}

export function htmlToTree(html: string): UINode {
  const doc = new DOMParser().parseFromString(`<root>${html.trim()}</root>`, 'text/html')
  // DOMParser wraps in <html><body>; our <root> lands in body.
  const root = doc.body.querySelector('root')
  const first = root?.firstElementChild
  if (!first) throw new Error('nenhum elemento raiz encontrado')
  return elementToNode(first)
}

// ── tree → HTML (for "view as HTML" / round-trip) ──────────────────────────────
// Escape so a text like `a < b & "c"` survives the round trip instead of becoming a
// phantom <b> element / broken attribute.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function styleToString(st: UINode): string {
  return Object.entries(st)
    .filter(([, v]) => v != null && v !== '')   // skip undefined/empty — no "k:undefined" noise
    .map(([k, v]) => Array.isArray(v) ? `${k}:${v.join(',')}` : `${k}:${v}`)
    .join('; ')
}

export function treeToHtml(node: UINode, indent = 0): string {
  if (typeof node !== 'object' || node == null) return ''
  const pad = '  '.repeat(indent)
  const tag = node.tag || (node.type === 'text_input' ? 'input' : node.type) || 'div'
  const attrs: string[] = []
  let innerText = ''
  for (const k of Object.keys(node)) {
    if (k === 'tag' || k === 'type' || k === 'children' || k === 'tabs' || k === 'style') continue
    if (k === 'text' && TEXT_TAGS.has(tag)) { innerText = esc(String(node[k])); continue }
    const v = node[k]
    if (v == null || v === '') continue           // skip empty attrs
    attrs.push(`${k}="${esc(Array.isArray(v) ? v.join(',') : String(v))}"`)
  }
  if (node.style && Object.keys(node.style).length) attrs.unshift(`style="${esc(styleToString(node.style))}"`)
  const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`
  // tabs → children tagged with tab_label (the inverse of htmlToTree's <tabs> rule)
  const kids: UINode[] = Array.isArray(node.tabs)
    ? node.tabs.map((t: any) => ({ ...(t.child || { tag: 'div' }), tab_label: t.label }))
    : Array.isArray(node.children) ? node.children : []
  if (!kids.length) return `${pad}${open}${innerText}</${tag}>`
  const inner = kids.map((c: UINode) => treeToHtml(c, indent + 1)).join('\n')
  return `${pad}${open}\n${inner}\n${pad}</${tag}>`
}
