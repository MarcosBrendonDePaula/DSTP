// Live HTML preview of a UI tree — a faithful-ish reimplementation of the mod's Lua
// renderer (ui_widgets.lua) so you SEE the UI as you build it, side by side with the
// tree editor. It is an approximation (DST fonts/textures differ), but the layout
// (panel/col/row/tabs), colours, and the relative look match. Clicking a rendered
// element selects its node in the tree (selPath).
//
// It walks the same {type, ...props, children} tree the backend ships, mirroring each
// branch of RenderNode. Templates ({{...}}) are shown literally — the preview can't
// resolve flow context.

import { normalizeElement } from './elementModel'

type UINode = Record<string, any>
type Step = { kind: 'child' | 'tab'; i: number }

// Render a user string for the preview, but collapse each {{template}} into a compact "var"
// chip instead of printing the whole expression (which overflows tiny widgets). Plain text
// passes through. `{{= js }}` shows as an "fx" chip. Used everywhere the editor echoes
// author-entered text (titles, button labels, text nodes, field values…).
function tmpl(s: any): React.ReactNode {
  const str = s == null ? '' : String(s)
  if (!str.includes('{{')) return str
  const parts: React.ReactNode[] = []
  const re = /\{\{([\s\S]*?)\}\}/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(str))) {
    if (m.index > last) parts.push(str.slice(last, m.index))
    const expr = m[1].trim()
    const isJs = expr.startsWith('=')
    // short label: last path segment, or "fx" for a JS expression
    const label = isJs ? 'fx' : (expr.split(/[.\s]/).filter(Boolean).pop() || 'var')
    parts.push(
      <span key={i++} title={`{{${m[1]}}}`} style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, verticalAlign: 'baseline',
        padding: '0 4px', margin: '0 1px', borderRadius: 4, fontSize: '0.78em', lineHeight: 1.4,
        background: isJs ? 'rgba(244,114,182,0.18)' : 'rgba(99,102,241,0.22)',
        color: isJs ? '#f9a8d4' : '#c7d2fe', border: `1px solid ${isJs ? 'rgba(244,114,182,0.4)' : 'rgba(129,140,248,0.4)'}`,
        fontFamily: 'ui-monospace, monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{isJs ? 'ƒ' : '⧉'} {label}</span>
    )
    last = m.index + m[0].length
  }
  if (last < str.length) parts.push(str.slice(last))
  return <>{parts}</>
}

// Parse a "[r,g,b,a]" string or array into a CSS rgba. Default white.
function toCss(color: any, fallback = 'rgba(255,255,255,1)'): string {
  let c = color
  if (typeof c === 'string') {
    const s = c.trim()
    if (s.startsWith('[')) { try { c = JSON.parse(s) } catch { return fallback } }
    else return fallback
  }
  if (Array.isArray(c)) {
    const [r = 1, g = 1, b = 1, a = 1] = c
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`
  }
  return fallback
}

// Map our style props to CSS, matching how the Lua renderer interprets them.
function cssJustify(j: any): string {
  switch (j) { case 'start': return 'flex-start'; case 'end': return 'flex-end'; case 'between': return 'space-between'; default: return 'center' }
}
function cssAlign(a: any): string {
  switch (a) { case 'start': return 'flex-start'; case 'end': return 'flex-end'; case 'stretch': return 'stretch'; default: return 'center' }
}
function cssColor(v: any): string | undefined {
  if (v == null) return undefined
  if (Array.isArray(v)) { const [r = 1, g = 1, b = 1, a = 1] = v; return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})` }
  return toCss(v, undefined as any) || undefined
}
// A size prop → CSS. Percent = exact (width/height: fills the parent). Pixels = a
// MINIMUM (min-width/height) so the box grows to fit content, like the renderer.
function sizeStyle(v: any, dim: 'width' | 'height'): React.CSSProperties {
  if (v == null || v === '') return {}
  const s = String(v)
  if (s.includes('%')) return { [dim]: s }
  const n = Number(s)
  if (Number.isNaN(n)) return {}
  return { [dim === 'width' ? 'minWidth' : 'minHeight']: n }
}

// px number → px; "50%" → "50%"; else undefined (auto).
function cssSize(v: any): number | string | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return v
  const s = String(v)
  if (s.includes('%')) return s
  const n = Number(s)
  return Number.isNaN(n) ? undefined : n
}

const samePath = (a: Step[], b: Step[]) =>
  a.length === b.length && a.every((s, i) => s.kind === b[i].kind && s.i === b[i].i)

// Reorder a child within its container by drag. Each rendered child is draggable;
// dropping it onto a sibling swaps their order. onReorder(parentPath, from, to).
type Reorder = (parentPath: Step[], from: number, to: number) => void
// Move a child to an absolute x,y inside a canvas container (free drag). childPath is the
// dragged child; x,y are game-space px relative to the container top-left corner.
type Move = (childPath: Step[], x: number, y: number) => void

// Drop into a specific grid cell: assign the child at gridPath to cell (gx,gy), OR create a
// new child from a palette type dropped on an empty cell. type==null → move existing child.
type CellDrop = (gridPath: Step[], gx: number, gy: number, opts: { childIndex?: number; addType?: string }) => void

export function NodeView({ node, path, sel, onSelect, onReorder, onMove, editor, onCellDrop }: {
  node: UINode; path: Step[]; sel: Step[]; onSelect: (p: Step[]) => void; onReorder?: Reorder; onMove?: Move
  editor?: boolean  // when true, grid containers draw the cell table + accept cell drops
  onCellDrop?: CellDrop
}): React.ReactNode {
  node = normalizeElement(node)   // accept element model { tag, style } too
  if (!node || !node.type) return null
  const isSel = samePath(path, sel)
  const ring = isSel ? '0 0 0 2px #6366f1' : undefined
  const pick = (e: React.MouseEvent) => { e.stopPropagation(); onSelect(path) }
  const t = node.type
  // Canvas = absolute x/y placement. But if NO child declares x/y, treating it as canvas
  // would stack everything at (0,0) — so fall back to normal (flex) stacking. This makes
  // a stray display:absolute without coords behave sanely instead of overlapping.
  const childrenHaveXY = Array.isArray(node.children) && node.children.some((c: any) => c?.x != null || c?.y != null)
  const isCanvas = node.mode === 'canvas' && childrenHaveXY && (t === 'panel' || t === 'col' || t === 'row')
  // A container with `repeat` is a LIST (loop): mark it with a distinct dashed purple
  // border + a 🔁 badge so it's obvious the first child is a per-item template.
  const isList = !!node.repeat && (t === 'panel' || t === 'col' || t === 'row')
  const listOutline = isList ? '2px dashed #a855f7' : undefined
  const listBadge = isList ? (
    <span style={{ position: 'absolute', top: -8, left: 6, fontSize: 9, padding: '0 4px', borderRadius: 4,
      background: '#a855f7', color: '#fff', fontWeight: 600, zIndex: 2, pointerEvents: 'none' }}>🔁 lista</span>
  ) : null

  // A child wrapped so it can be dragged to reorder within THIS container. The drag
  // payload is the source index; dropping on another child reorders. Only children
  // (not tabs) reorder.
  const childViews = (arr: UINode[] | undefined) =>
    (arr || []).map((c, i) => (
      <div
        key={i}
        draggable={!!onReorder}
        onDragStart={onReorder ? (e => { e.stopPropagation(); e.dataTransfer.setData('text/dstp-reorder', String(i)); e.dataTransfer.effectAllowed = 'move' }) : undefined}
        onDragOver={onReorder ? (e => { if (e.dataTransfer.types.includes('text/dstp-reorder')) { e.preventDefault(); e.stopPropagation() } }) : undefined}
        onDrop={onReorder ? (e => {
          const raw = e.dataTransfer.getData('text/dstp-reorder')
          if (raw === '') return
          e.preventDefault(); e.stopPropagation()
          const from = Number(raw)
          if (Number.isFinite(from) && from !== i) onReorder(path, from, i)
        }) : undefined}
        style={{
          cursor: onReorder ? 'grab' : undefined,
          // Per-component scale (mirrors SetScale in the mod). Origin top-left so it
          // grows toward the layout flow.
          transform: c?.scale && Number(c.scale) !== 1 ? `scale(${Number(c.scale)})` : undefined,
          transformOrigin: 'top left',
        }}
      >
        <NodeView node={c} path={[...path, { kind: 'child', i }]} sel={sel} onSelect={onSelect} onReorder={onReorder} onMove={onMove} />
      </div>
    ))

  // Canvas children: each absolutely positioned at its own x,y and free-draggable.
  // Pointer drag in screen px ≈ game px (preview renders 1:1), updates x,y via onMove.
  const canvasChildViews = (arr: UINode[] | undefined) =>
    (arr || []).map((c, i) => {
      const cx = Number(c?.x) || 0
      const cy = Number(c?.y) || 0
      const childPath: Step[] = [...path, { kind: 'child', i }]
      const onDown = (e: React.PointerEvent) => {
        if (!onMove) return
        e.stopPropagation(); onSelect(childPath)
        const startX = e.clientX, startY = e.clientY
        const el = e.currentTarget as HTMLElement
        el.setPointerCapture(e.pointerId)
        const move = (ev: PointerEvent) => {
          onMove(childPath, Math.round(cx + (ev.clientX - startX)), Math.round(cy + (ev.clientY - startY)))
        }
        const up = (ev: PointerEvent) => {
          el.releasePointerCapture(e.pointerId)
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up)
        }
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
      }
      return (
        <div key={i} onPointerDown={onDown} style={{
          position: 'absolute', left: cx, top: cy, cursor: onMove ? 'move' : undefined,
          transform: c?.scale && Number(c.scale) !== 1 ? `scale(${Number(c.scale)})` : undefined,
          transformOrigin: 'top left', touchAction: 'none',
        }}>
          <NodeView node={c} path={childPath} sel={sel} onSelect={onSelect} onReorder={onReorder} onMove={onMove} />
        </div>
      )
    })

  if (t === 'panel') {
    // Fixed size when width/height are set (mirrors the renderer's fixed mode); else
    // auto-size to content. So adjusting width/height reflects in the preview.
    const pw = Number(node.width) || undefined
    const ph = Number(node.height) || undefined
    return (
      <div onClick={pick} style={{
        position: 'relative', background: 'rgba(20,20,26,0.95)',
        border: listOutline || '1px solid rgba(120,90,150,0.6)', borderRadius: 6,
        padding: isCanvas ? 0 : '10px 12px', minWidth: 120, boxShadow: ring,
        width: pw, height: ph,
        display: isCanvas ? 'block' : 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        {listBadge}
        {!isCanvas && node.title && <div style={{ color: 'rgba(255,255,210,1)', fontWeight: 600, fontSize: 13 }}>{tmpl(node.title)}</div>}
        {!isCanvas && node.body && <div style={{ color: '#fff', fontSize: 11, maxWidth: ph ? '100%' : 220, textAlign: 'left' }}>{tmpl(node.body)}</div>}
        {isCanvas ? canvasChildViews(node.children) : childViews(node.children)}
        {isCanvas && node.title && <div style={{ position: 'absolute', top: 4, left: 8, color: 'rgba(255,255,210,0.9)', fontWeight: 600, fontSize: 13, pointerEvents: 'none' }}>{tmpl(node.title)}</div>}
        {node.closeable !== false && (
          <div style={{ position: 'absolute', top: 4, right: 6, color: '#d88', fontSize: 12 }}>✕</div>
        )}
        {node.draggable && (
          <div style={{ position: 'absolute', top: 3, left: 6, color: '#888', fontSize: 9 }}>⠿ arrastável</div>
        )}
      </div>
    )
  }
  if (t === 'col' || t === 'row') {
    const gap = Number(node.gap) || (t === 'col' ? 8 : 12)
    if (isCanvas) {
      return (
        <div onClick={pick} style={{
          position: 'relative', borderRadius: 4, boxShadow: ring,
          width: Number(node.width) || 200, height: Number(node.height) || 120,
          outline: '1px dashed rgba(80,230,150,0.25)',
        }}>
          {canvasChildViews(node.children)}
        </div>
      )
    }
    if (node.mode === 'grid') {
      // Layout grid by ROWS of widths (Bootstrap-like). `grid_rows` is a list of width
      // specs, one per row, e.g. ["50 50", "25 25 25 25", "50 50"]. Each number is a column
      // weight (fr) in that row. A child sits in cell (gr=row, gc=col). Empty cells are drop
      // targets in the editor. Default when unset: one row matching `cols` equal columns.
      const kids: UINode[] = Array.isArray(node.children) ? node.children : []
      const gap = Number(node.gap) || 8
      // A row spec is "<widths> [@height]" — widths are column weights (fr), optional @N is the
      // row's HEIGHT WEIGHT (fr of the grid's total height, like the widths are fr of total
      // width). No @ → the row gets weight 1 (auto-fair share). Total height = node.height.
      const parseRow = (s: any): { w: number[]; h?: number } => {
        const str = String(s ?? '').trim()
        const m = str.match(/@\s*(\d+(?:\.\d+)?)/)
        const h = m ? Number(m[1]) : undefined
        const w = str.replace(/@\s*\d+(?:\.\d+)?/, '').trim().split(/\s+/).map(Number).filter(n => n > 0)
        return { w, h }
      }
      let rowSpecs: { w: number[]; h?: number }[] = Array.isArray(node.grid_rows) && node.grid_rows.length
        ? node.grid_rows.map(parseRow).filter(r => r.w.length)
        : []
      // `rows` set (without grid_rows) → fix the ROW count and flow into COLUMNS (fill down
      // then across): rows=2, 7 items → 4 columns (2+2+2+1). Otherwise `cols` fixes columns
      // and flows into rows (the default).
      const flowByColumn = !node.grid_rows?.length && Number(node.rows) > 0
      if (!rowSpecs.length) {
        if (flowByColumn) {
          const rws = Math.max(1, Math.floor(Number(node.rows)))
          const ncols = Math.max(1, Math.ceil(kids.length / rws))
          rowSpecs = Array.from({ length: rws }, () => ({ w: Array.from({ length: ncols }, () => 1) }))
        } else {
          const c = Math.max(1, Math.floor(Number(node.cols) || 2))
          const need = Math.max(1, Math.ceil(kids.length / c))
          rowSpecs = Array.from({ length: need }, () => ({ w: Array.from({ length: c }, () => 1) }))
        }
      }
      // child lookup by cell
      const childAt: Record<string, number> = {}
      kids.forEach((c, i) => {
        const gr = Math.max(0, Math.floor(Number(c.gr) || 0))
        const gc = Math.max(0, Math.floor(Number(c.gc) || 0))
        if (childAt[`${gr},${gc}`] == null) childAt[`${gr},${gc}`] = i
      })
      // auto-flow children with no explicit cell. Row-major by default; column-major when
      // flowing by column (fill column top→bottom, then next column).
      const assigned = new Set(Object.values(childAt))
      let af = 0
      const freeCells: Array<{ r: number; c: number }> = []
      const nCols = rowSpecs[0]?.w.length || 1
      if (flowByColumn) {
        for (let c = 0; c < nCols; c++) for (let r = 0; r < rowSpecs.length; r++) { if (childAt[`${r},${c}`] == null) freeCells.push({ r, c }) }
      } else {
        rowSpecs.forEach((rs, r) => rs.w.forEach((_, c) => { if (childAt[`${r},${c}`] == null) freeCells.push({ r, c }) }))
      }
      kids.forEach((_, i) => {
        if (assigned.has(i)) return
        const cell = freeCells[af++]
        if (cell) childAt[`${cell.r},${cell.c}`] = i
      })

      const cellDrop = (r: number, c: number) => (editor && onCellDrop ? {
        onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('text/dstp-gridchild')) { e.preventDefault(); e.stopPropagation() } },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault(); e.stopPropagation()
          const moved = e.dataTransfer.getData('text/dstp-gridchild')
          if (moved !== '') onCellDrop(path, c, r, { childIndex: Number(moved) })
          else { const at = e.dataTransfer.getData('text/plain'); if (at) onCellDrop(path, c, r, { addType: at }) }
        },
      } : {})

      // Row heights are fr weights of the PARENT grid's total height (node.height). A row
      // without @ gets weight 1. The outer grid splits node.height by these weights.
      const rowFr = rowSpecs.map(rs => rs.h && rs.h > 0 ? rs.h : 1)
      return (
        <div onClick={pick} style={{
          display: 'grid', gridTemplateRows: rowFr.map(f => `${f}fr`).join(' '), gap,
          padding: 2, borderRadius: 4, boxShadow: ring,
          width: Number(node.width) || undefined, height: Number(node.height) || undefined,
          outline: editor ? '1px solid rgba(120,170,255,0.5)' : '1px dashed rgba(120,170,255,0.2)',
        }}>
          {rowSpecs.map((rs, r) => (
            <div key={r} style={{ display: 'grid', gridTemplateColumns: rs.w.map(w => `${w}fr`).join(' '), gap, minHeight: 0 }}>
              {rs.w.map((_, c) => {
                const i = childAt[`${r},${c}`]
                return (
                  <div key={c} {...cellDrop(r, c)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: 24, minWidth: 20,
                    outline: editor ? '1px dashed rgba(120,170,255,0.35)' : undefined,
                    background: editor && i == null ? 'rgba(120,170,255,0.04)' : undefined,
                  }}>
                    {i != null && (
                      <div draggable={!!editor}
                        onDragStart={editor ? (e => { e.stopPropagation(); e.dataTransfer.setData('text/dstp-gridchild', String(i)); e.dataTransfer.effectAllowed = 'move' }) : undefined}
                        style={{ cursor: editor ? 'grab' : undefined, width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <NodeView node={kids[i]} path={[...path, { kind: 'child', i }]} sel={sel} onSelect={onSelect} editor={editor} onCellDrop={onCellDrop} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )
    }
    return (
      <div onClick={pick} style={{
        position: 'relative',
        display: 'flex', flexDirection: t === 'col' ? 'column' : 'row',
        gap,
        // honour the same box-model props the Lua renderer reads (justify/align/
        // padding/background/opacity/size — incl. percent sizes which CSS takes as-is).
        justifyContent: cssJustify(node.justify),
        alignItems: cssAlign(node.align),
        padding: node.padding != null ? Number(node.padding) : (isList ? 8 : 2),
        background: cssColor(node.background),
        opacity: node.opacity != null ? Number(node.opacity) : undefined,
        borderRadius: 4, boxShadow: ring,
        // % width = exact (fills parent); px width = MINIMUM (grows to fit content,
        // matching the renderer). Same for height.
        ...sizeStyle(node.width, 'width'),
        ...sizeStyle(node.height, 'height'),
        zIndex: node.z != null ? Number(node.z) : undefined,
        boxSizing: 'border-box',
        outline: listOutline || '1px dashed rgba(255,255,255,0.08)',
      }}>
        {listBadge}
        {isList ? childViews(node.children.slice(0, 1)) : childViews(node.children)}
      </div>
    )
  }
  if (t === 'tabs') {
    const tabs = node.tabs || []
    const active = Number(node.active) || 0
    return (
      <div onClick={pick} style={{ display: 'flex', flexDirection: 'column', gap: 4, boxShadow: ring, padding: 2 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map((tb: any, i: number) => (
            <div key={i} style={{
              padding: '2px 8px', fontSize: 10, borderRadius: 3,
              background: i === active ? 'rgba(120,90,180,0.5)' : 'rgba(255,255,255,0.06)',
              color: i === active ? '#fff' : '#aaa',
            }}>{tb.label || `Aba ${i + 1}`}</div>
          ))}
        </div>
        {tabs[active]?.child && (
          <NodeView node={tabs[active].child} path={[...path, { kind: 'tab', i: active }]} sel={sel} onSelect={onSelect} onReorder={onReorder} onMove={onMove} />
        )}
      </div>
    )
  }
  if (t === 'text') {
    const fixW = Number(node.width) || Number(node.wrap_width) || undefined
    const fixH = Number(node.height) || Number(node.wrap_height) || undefined
    return (
      <div onClick={pick} style={{
        color: toCss(node.color), fontSize: Number(node.size) || 18, boxShadow: ring,
        padding: '0 2px', borderRadius: 2,
        width: fixW, height: fixH,
        whiteSpace: fixW ? 'normal' : 'pre-wrap',  // word-wrap when boxed
        overflow: fixH ? 'hidden' : undefined,
      }}>{node.text ? tmpl(node.text) : 'Texto'}</div>
    )
  }
  if (t === 'text_input') {
    return (
      <div onClick={pick} style={{
        width: Number(node.width) || 280, height: Number(node.height) || 36,
        background: 'rgba(13,13,18,0.9)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 8px',
        color: node.value ? toCss(node.color) : 'rgba(150,150,150,1)',
        fontSize: Number(node.size) || 18, boxShadow: ring,
      }}>{node.value ? tmpl(node.value) : (node.placeholder ? tmpl(node.placeholder) : 'campo de texto')}</div>
    )
  }
  if (t === 'button') {
    return (
      <div onClick={pick} style={{
        width: Number(node.width) || 120, height: Number(node.height) || 36, padding: '0 14px',
        background: 'linear-gradient(#caa45a,#a8853f)', border: '1px solid #7a5e2a',
        borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: toCss(node.color, '#3a2c12'), fontSize: Number(node.size) || 14, fontWeight: 600,
        boxShadow: ring, overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{node.text ? tmpl(node.text) : 'Botão'}</div>
    )
  }
  if (t === 'bar') {
    const v = Number(node.value) || 0, max = Number(node.max) || 1
    const pct = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0
    const w = Number(node.width) || 200
    const h = Number(node.height) || 16
    return (
      <div onClick={pick} style={{
        position: 'relative', width: w, height: h, background: 'rgba(50,50,50,1)',
        borderRadius: 2, boxShadow: ring, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: toCss(node.color, 'rgba(50,230,50,1)') }} />
        {node.label && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>{tmpl(node.label)}</div>}
      </div>
    )
  }
  if (t === 'icon') {
    const size = Number(node.size) || 48
    const iw = Number(node.width) || size
    const ih = Number(node.height) || size
    return (
      <div onClick={pick} title={node.prefab} style={{
        width: iw, height: ih, background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: '#9af', boxShadow: ring, textAlign: 'center', overflow: 'hidden',
      }}>{node.prefab || 'icon'}</div>
    )
  }
  if (t === 'image') {
    return (
      <div onClick={pick} style={{
        width: Number(node.width) || 64, height: Number(node.height) || 64,
        background: toCss(node.tint, 'rgba(120,120,140,1)'), borderRadius: 3, boxShadow: ring,
      }} />
    )
  }
  if (t === 'spacer') {
    return <div onClick={pick} style={{ width: Number(node.width) || 8, height: Number(node.height) || 8, boxShadow: ring }} />
  }
  // Unknown
  return <div onClick={pick} style={{ color: '#a55', fontSize: 10, boxShadow: ring }}>?{t}</div>
}

export function UIPreview({ tree, sel, onSelect, onReorder, onMove, bare }: {
  tree: UINode | null; sel: Step[]; onSelect: (p: Step[]) => void; onReorder?: Reorder; onMove?: Move; bare?: boolean
}) {
  const root = tree && tree.type ? tree : { type: 'panel', title: 'Painel', children: [] }
  const inner = (
    <div style={{ transform: root.scale && Number(root.scale) !== 1 ? `scale(${Number(root.scale)})` : undefined, transformOrigin: 'center center' }}>
      <NodeView node={root} path={[]} sel={sel} onSelect={onSelect} onReorder={onReorder} onMove={onMove} />
    </div>
  )
  // bare = no preview chrome (used inside the fullscreen game-screen editor, which
  // provides the screen background and positions this absolutely).
  if (bare) return inner
  return (
    <div className="border border-white/10 rounded-lg bg-black/40 overflow-auto flex items-center justify-center"
      style={{ minHeight: 300, maxHeight: 460, padding: 16,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
      {inner}
    </div>
  )
}
