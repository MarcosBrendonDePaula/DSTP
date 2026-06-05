// Live HTML preview of a UI tree — a faithful-ish reimplementation of the mod's Lua
// renderer (ui_widgets.lua) so you SEE the UI as you build it, side by side with the
// tree editor. It is an approximation (DST fonts/textures differ), but the layout
// (panel/col/row/tabs), colours, and the relative look match. Clicking a rendered
// element selects its node in the tree (selPath).
//
// It walks the same {type, ...props, children} tree the backend ships, mirroring each
// branch of RenderNode. Templates ({{...}}) are shown literally — the preview can't
// resolve flow context.

type UINode = Record<string, any>
type Step = { kind: 'child' | 'tab'; i: number }

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

const samePath = (a: Step[], b: Step[]) =>
  a.length === b.length && a.every((s, i) => s.kind === b[i].kind && s.i === b[i].i)

// Reorder a child within its container by drag. Each rendered child is draggable;
// dropping it onto a sibling swaps their order. onReorder(parentPath, from, to).
type Reorder = (parentPath: Step[], from: number, to: number) => void

function NodeView({ node, path, sel, onSelect, onReorder }: {
  node: UINode; path: Step[]; sel: Step[]; onSelect: (p: Step[]) => void; onReorder?: Reorder
}): React.ReactNode {
  if (!node || !node.type) return null
  const isSel = samePath(path, sel)
  const ring = isSel ? '0 0 0 2px #6366f1' : undefined
  const pick = (e: React.MouseEvent) => { e.stopPropagation(); onSelect(path) }
  const t = node.type

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
        style={{ cursor: onReorder ? 'grab' : undefined }}
      >
        <NodeView node={c} path={[...path, { kind: 'child', i }]} sel={sel} onSelect={onSelect} onReorder={onReorder} />
      </div>
    ))

  if (t === 'panel') {
    return (
      <div onClick={pick} style={{
        position: 'relative', background: 'rgba(20,20,26,0.95)',
        border: '1px solid rgba(120,90,150,0.6)', borderRadius: 6,
        padding: '10px 12px', minWidth: 120, boxShadow: ring,
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        {node.title && <div style={{ color: 'rgba(255,255,210,1)', fontWeight: 600, fontSize: 13 }}>{node.title}</div>}
        {node.body && <div style={{ color: '#fff', fontSize: 11, maxWidth: 220, textAlign: 'left' }}>{node.body}</div>}
        {childViews(node.children)}
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
    return (
      <div onClick={pick} style={{
        display: 'flex', flexDirection: t === 'col' ? 'column' : 'row',
        gap, alignItems: 'center', justifyContent: 'center',
        padding: 2, borderRadius: 4, boxShadow: ring,
        outline: '1px dashed rgba(255,255,255,0.08)',
      }}>
        {childViews(node.children)}
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
          <NodeView node={tabs[active].child} path={[...path, { kind: 'tab', i: active }]} sel={sel} onSelect={onSelect} onReorder={onReorder} />
        )}
      </div>
    )
  }
  if (t === 'text') {
    return (
      <div onClick={pick} style={{
        color: toCss(node.color), fontSize: Number(node.size) || 18, boxShadow: ring,
        padding: '0 2px', borderRadius: 2, whiteSpace: 'pre-wrap',
      }}>{node.text || 'Texto'}</div>
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
      }}>{node.value || node.placeholder || 'campo de texto'}</div>
    )
  }
  if (t === 'button') {
    return (
      <div onClick={pick} style={{
        minWidth: Number(node.width) || 120, height: 36, padding: '0 14px',
        background: 'linear-gradient(#caa45a,#a8853f)', border: '1px solid #7a5e2a',
        borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: toCss(node.color, '#3a2c12'), fontSize: Number(node.size) || 14, fontWeight: 600,
        boxShadow: ring,
      }}>{node.text || 'Botão'}</div>
    )
  }
  if (t === 'bar') {
    const v = Number(node.value) || 0, max = Number(node.max) || 1
    const pct = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0
    const w = Number(node.width) || 200
    return (
      <div onClick={pick} style={{
        position: 'relative', width: w, height: 16, background: 'rgba(50,50,50,1)',
        borderRadius: 2, boxShadow: ring, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: toCss(node.color, 'rgba(50,230,50,1)') }} />
        {node.label && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>{node.label}</div>}
      </div>
    )
  }
  if (t === 'icon') {
    const size = Number(node.size) || 48
    return (
      <div onClick={pick} title={node.prefab} style={{
        width: size, height: size, background: 'rgba(255,255,255,0.06)',
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

export function UIPreview({ tree, sel, onSelect, onReorder }: {
  tree: UINode | null; sel: Step[]; onSelect: (p: Step[]) => void; onReorder?: Reorder
}) {
  const root = tree && tree.type ? tree : { type: 'panel', title: 'Painel', children: [] }
  return (
    <div className="border border-white/10 rounded-lg bg-black/40 overflow-auto flex items-center justify-center"
      style={{ minHeight: 300, maxHeight: 460, padding: 16,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
      <NodeView node={root} path={[]} sel={sel} onSelect={onSelect} onReorder={onReorder} />
    </div>
  )
}
