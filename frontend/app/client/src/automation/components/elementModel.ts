// Element model (HTML/CSS-like) → legacy node, for the FRONTEND preview/editor.
// Faithful port of NormalizeElement in DST_MOD/scripts/dstp/ui_widgets.lua so the
// preview renders { tag, style, children } the same way the game does. Legacy nodes
// (no `tag`) pass through untouched. See DST_MOD/specs/ui-element-model.md.

type UINode = Record<string, any>

const DISPLAY_TO_LEGACY: Record<string, { type: string; mode?: string }> = {
  flex: { type: 'col' },
  grid: { type: 'col', mode: 'grid' },
  block: { type: 'col' },
  absolute: { type: 'panel', mode: 'canvas' },
}

export function normalizeElement(node: UINode): UINode {
  if (typeof node !== 'object' || node == null || node.tag == null) return node
  const st = node.style || {}
  const out: UINode = {}
  for (const k of Object.keys(node)) if (k !== 'tag' && k !== 'style') out[k] = node[k]
  // box-model style → flat props the legacy renderer/preview read
  out.width = st.width; out.height = st.height
  out.width_ref = st.width_ref; out.height_ref = st.height_ref
  out.gap = st.gap; out.scale = st.scale
  out.x = st.x; out.y = st.y
  out.padding = st.padding; out.justify = st.justify; out.align = st.align
  out.margin = st.margin; out.background = st.background; out.border = st.border
  out.opacity = st.opacity; out.z = st.z
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

// Recursively normalize a whole tree (the preview walks children itself, but the code
// editor wants a fully-legacy tree to hand to the existing renderer/validator).
export function normalizeTree(node: UINode): UINode {
  const n = normalizeElement(node)
  if (n && Array.isArray(n.children)) n.children = n.children.map(normalizeTree)
  if (n && Array.isArray(n.tabs)) n.tabs = n.tabs.map((t: any) => ({ ...t, child: t.child ? normalizeTree(t.child) : t.child }))
  return n
}

// ── resolve percent sizes → px (mirror of ui_widgets.lua ResolveSize) ──────────
// CSS % is always "% of the immediate parent", but our model has width_ref
// (screen/panel/parent). So we PRE-RESOLVE percents to pixels here, using the same
// references the game uses, then the preview renders plain px and matches the game.
const SCREEN_W = 1280, SCREEN_H = 720
function resolveOne(v: any, ref: string | undefined, screen: number, panel: number | undefined, parent: number): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  if (!Number.isNaN(n) && !String(v).includes('%')) return n
  const m = String(v).match(/^\s*(-?\d+\.?\d*)\s*%\s*$/)
  if (!m) return undefined
  const pct = Number(m[1])
  const r = (ref || 'parent').toLowerCase()
  const base = r === 'screen' ? screen : r === 'panel' ? panel : parent
  if (!base || base <= 0) return undefined
  return (base * pct) / 100
}
// Walk the (legacy-shaped) tree resolving width/height. parentW/H = the resolved box
// of the container; panelW/H = the root panel's resolved box.
export function resolveSizes(node: UINode, parentW = SCREEN_W, parentH = SCREEN_H, panelW?: number, panelH?: number): UINode {
  if (typeof node !== 'object' || node == null) return node
  const out: UINode = { ...node }
  const w = resolveOne(node.width, node.width_ref, SCREEN_W, panelW, parentW)
  const h = resolveOne(node.height, node.height_ref, SCREEN_H, panelH, parentH)
  if (w != null) out.width = w
  if (h != null) out.height = h
  // root panel size becomes the panel reference for descendants
  const pw = panelW ?? w ?? parentW
  const ph = panelH ?? h ?? parentH
  // Children resolve `%` against this container's CONTENT box (size minus padding),
  // so `width:100%` fits INSIDE the parent instead of overflowing it.
  const pad = Number(node.padding) || 0
  const cw = (w ?? parentW) - 2 * pad
  const ch = (h ?? parentH) - 2 * pad
  if (Array.isArray(node.children)) out.children = node.children.map((c: UINode) => resolveSizes(c, cw, ch, pw, ph))
  if (Array.isArray(node.tabs)) out.tabs = node.tabs.map((t: any) => ({ ...t, child: t.child ? resolveSizes(t.child, cw, ch, pw, ph) : t.child }))
  return out
}

// ── legacy node → element model (the inverse, for the code editor's "view as HTML") ──
const STYLE_KEYS = new Set([
  'width', 'height', 'width_ref', 'height_ref', 'gap', 'scale', 'x', 'y',
  'padding', 'justify', 'align', 'margin', 'background', 'border', 'opacity', 'color', 'z',
])
const CONTAINER_TYPES = new Set(['col', 'row', 'panel'])

export function toElement(node: UINode): UINode {
  if (typeof node !== 'object' || node == null) return node
  if (node.tag) {
    // already an element — just recurse children
    const out: UINode = { ...node }
    if (Array.isArray(out.children)) out.children = out.children.map(toElement)
    return out
  }
  const t = node.type
  const out: UINode = {}
  const style: UINode = {}
  // derive tag + display from the legacy type/mode
  if (CONTAINER_TYPES.has(t)) {
    out.tag = 'div'
    if (node.mode === 'grid') { style.display = 'grid'; if (node.cols) style.cols = node.cols; if (node.grid_rows) style.grid_template = node.grid_rows }
    else if (node.mode === 'canvas') style.display = 'absolute'
    else { style.display = 'flex'; style.direction = t === 'row' ? 'row' : 'column' }
  } else {
    out.tag = t === 'text_input' ? 'input' : t
  }
  // split props: style keys → style, the rest stay on the element (content/id/callback/…)
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'mode' || k === 'cols' || k === 'grid_rows') continue
    if (k === 'children') { out.children = node.children.map(toElement); continue }
    if (k === 'tabs') { out.tabs = node.tabs.map((tb: any) => ({ ...tb, child: tb.child ? toElement(tb.child) : tb.child })); continue }
    if (node[k] == null) continue                 // skip empty — no style/attr noise
    if (STYLE_KEYS.has(k)) style[k] = node[k]
    else out[k] = node[k]
  }
  if (Object.keys(style).length) out.style = style
  return out
}
