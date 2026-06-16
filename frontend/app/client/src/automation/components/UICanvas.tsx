// WYSIWYG form designer for a ui_builder tree — Visual Basic style. The root panel is
// the "form"; its canvas children are placed absolutely, free-dragged, and resized with
// corner handles. Dragging a block from the palette onto the form creates a child at the
// drop point. Renders at 1:1 game px (the same space the mod's renderer uses), so what you
// position here is where it lands in-game.
//
// Only the FIRST level of a `mode:'canvas'` container is designed here (its direct
// children). Nested layout/canvas inside a child still renders (via UIPreview's NodeView)
// but you position the child as a whole. Containers in `layout` mode fall back to the tree
// editor — this canvas is for absolute placement.

import { useRef, useState } from 'react'
import { NodeView } from './UIPreview'

type UINode = Record<string, any>
type Step = { kind: 'child' | 'tab'; i: number }

// Default size used to draw a handle box when a child has no explicit width/height.
function boxSize(c: UINode): { w: number; h: number } {
  const w = Number(c.width) || (c.type === 'button' ? 120 : c.type === 'bar' ? 200 : c.type === 'text_input' ? 280 : c.type === 'icon' ? Number(c.size) || 48 : c.type === 'image' ? 64 : 80)
  const h = Number(c.height) || (c.type === 'button' ? 36 : c.type === 'bar' ? 16 : c.type === 'text_input' ? 36 : c.type === 'icon' ? Number(c.size) || 48 : c.type === 'image' ? 64 : c.type === 'text' ? Number(c.size) || 24 : 40)
  return { w: w * (Number(c.scale) || 1), h: h * (Number(c.scale) || 1) }
}

export function UICanvas({
  root, sel, onSelect, onMoveChild, onResizeChild, onAddChild, onAddChildInto, onCellDrop, onResizeForm,
}: {
  root: UINode
  sel: Step[]
  onSelect: (p: Step[]) => void
  onMoveChild: (i: number, x: number, y: number) => void
  onResizeChild: (i: number, w: number, h: number) => void
  onAddChild: (type: string, x: number, y: number) => void
  onAddChildInto: (i: number, type: string) => void
  onCellDrop: (gridPath: Step[], gx: number, gy: number, opts: { childIndex?: number; addType?: string }) => void
  onResizeForm: (w: number, h: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  // The root must be a canvas container to design on. If it isn't, tell the user.
  const isCanvas = root.mode === 'canvas' && (root.type === 'panel' || root.type === 'col' || root.type === 'row')
  const formW = Number(root.width) || 260
  const formH = Number(root.height) || 180
  const children: UINode[] = Array.isArray(root.children) ? root.children : []

  // Convert a pointer event to form-local px (the form's top-left is the origin).
  const toLocal = (clientX: number, clientY: number) => {
    const el = wrapRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return { x: Math.round(clientX - r.left), y: Math.round(clientY - r.top) }
  }

  // Free-drag a child by its body. IMPORTANT: do NOT capture the pointer up-front — that
  // would swallow clicks meant for a child INSIDE the container (so you couldn't select a
  // node within a grid). Instead arm a threshold: only start dragging (and capturing) once
  // the pointer moves >4px. A pure click never captures → it reaches the inner NodeView,
  // which selects the clicked child.
  const startMove = (i: number, c: UINode) => (e: React.PointerEvent) => {
    e.stopPropagation()
    const sx = e.clientX, sy = e.clientY
    const ox = Number(c.x) || 0, oy = Number(c.y) || 0
    const el = e.currentTarget as HTMLElement
    let dragging = false
    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - sx) < 4 && Math.abs(ev.clientY - sy) < 4) return
        dragging = true
        onSelect([{ kind: 'child', i }])  // select the container only once a real drag begins
        el.setPointerCapture(e.pointerId)
      }
      onMoveChild(i, Math.round(ox + (ev.clientX - sx)), Math.round(oy + (ev.clientY - sy)))
    }
    const up = () => {
      if (dragging) el.releasePointerCapture(e.pointerId)
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
  }

  // Resize the FORM itself from its SE corner handle → sets the root width/height.
  const startResizeForm = (e: React.PointerEvent) => {
    e.stopPropagation(); onSelect([])
    const sx = e.clientX, sy = e.clientY
    const ow = formW, oh = formH
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => onResizeForm(Math.max(80, Math.round(ow + (ev.clientX - sx))), Math.max(60, Math.round(oh + (ev.clientY - sy))))
    const up = () => { el.releasePointerCapture(e.pointerId); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
  }

  // Resize a child from the SE corner handle → sets width/height.
  const startResize = (i: number, c: UINode) => (e: React.PointerEvent) => {
    e.stopPropagation(); onSelect([{ kind: 'child', i }])
    const sx = e.clientX, sy = e.clientY
    const { w: ow, h: oh } = boxSize(c)
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => onResizeChild(i, Math.max(8, Math.round(ow + (ev.clientX - sx))), Math.max(8, Math.round(oh + (ev.clientY - sy))))
    const up = () => { el.releasePointerCapture(e.pointerId); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
  }

  if (!isCanvas) {
    return (
      <div className="border border-amber-500/30 rounded-lg bg-amber-500/5 p-4 text-[11px] text-amber-300/90" style={{ minHeight: 200 }}>
        O componente raiz precisa estar em <b>modo canvas</b> para o designer visual.
        Selecione o painel raiz e mude <b>Layout</b> para <b>canvas</b> (e defina Largura/Altura),
        ou use a aba <b>🌳 Árvore</b> para layout empilhado.
      </div>
    )
  }

  return (
    <div className="border border-white/10 rounded-lg bg-black/50 overflow-auto p-6 flex items-start justify-center"
      style={{ minHeight: 360, maxHeight: 560,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
      {/* The form (root panel). Drop target for the palette. */}
      <div
        ref={wrapRef}
        onClick={e => { if (e.target === e.currentTarget) { e.stopPropagation(); onSelect([]) } }}
        onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const t = e.dataTransfer.getData('text/plain')
          if (t) { const { x, y } = toLocal(e.clientX, e.clientY); onAddChild(t, x, y) }
        }}
        style={{
          position: 'relative', width: formW, height: formH, flexShrink: 0,
          background: 'rgba(20,20,26,0.96)',
          border: dragOver ? '2px dashed rgba(80,230,150,0.8)' : '1px solid rgba(120,90,150,0.6)',
          borderRadius: 6, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {root.title && <div style={{ position: 'absolute', top: 6, left: 10, color: 'rgba(255,255,210,0.85)', fontWeight: 600, fontSize: 13, pointerEvents: 'none' }}>{root.title}</div>}
        {root.closeable !== false && <div style={{ position: 'absolute', top: 4, right: 8, color: '#d88', fontSize: 13, pointerEvents: 'none' }}>✕</div>}

        {children.map((c, i) => {
          const cx = Number(c.x) || 0, cy = Number(c.y) || 0
          const { w, h } = boxSize(c)
          const basePath: Step[] = [{ kind: 'child', i }]
          const isSel = sel.length === 1 && sel[0].kind === 'child' && sel[0].i === i
          // Is the selection somewhere INSIDE this container? (then don't show the container ring)
          const selInside = sel.length > 1 && sel[0].kind === 'child' && sel[0].i === i
          // A container child (col/row/grid) accepts blocks dropped ONTO it → added inside.
          const isCont = c.type === 'col' || c.type === 'row' || c.type === 'panel'
          return (
            <div key={i}
              onPointerDown={startMove(i, c)}
              onDragOver={isCont ? (e => { if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); e.stopPropagation() } }) : undefined}
              onDrop={isCont ? (e => {
                const t = e.dataTransfer.getData('text/plain')
                if (t) { e.preventDefault(); e.stopPropagation(); onAddChildInto(i, t) }
              }) : undefined}
              style={{ position: 'absolute', left: cx, top: cy, cursor: 'move', touchAction: 'none',
                outline: isSel ? '2px solid #6366f1' : selInside ? '1px solid rgba(99,102,241,0.5)' : isCont ? '1px dashed rgba(120,170,255,0.4)' : '1px dashed rgba(255,255,255,0.18)', outlineOffset: 1 }}>
              {/* Visual via the shared node renderer. Pass the real path + onSelect so clicking
                  a child INSIDE a grid/group selects that child (NodeView's pick stops
                  propagation), not the container. */}
              <NodeView node={c} path={basePath} sel={sel} onSelect={onSelect} editor onCellDrop={onCellDrop} />
              {/* SE resize handle (only when selected). */}
              {isSel && (
                <div onPointerDown={startResize(i, c)}
                  style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12,
                    background: '#6366f1', border: '2px solid #fff', borderRadius: 3, cursor: 'nwse-resize', touchAction: 'none' }}
                  title={`${Math.round(w)}×${Math.round(h)}`} />
              )}
              {/* x,y badge while selected */}
              {isSel && (
                <div style={{ position: 'absolute', top: -16, left: 0, fontSize: 9, color: '#a5b4fc', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                  {cx},{cy}
                </div>
              )}
            </div>
          )
        })}

        {/* Size badge of the form */}
        <div style={{ position: 'absolute', bottom: 2, right: 16, fontSize: 9, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>{formW}×{formH}</div>
        {/* Form SE resize handle — drag the corner to grow/shrink the whole form. */}
        <div onPointerDown={startResizeForm}
          style={{ position: 'absolute', right: -6, bottom: -6, width: 14, height: 14,
            background: 'rgba(120,90,150,0.9)', border: '2px solid #fff', borderRadius: 3,
            cursor: 'nwse-resize', touchAction: 'none' }}
          title="Redimensionar formulário" />
      </div>

      {/* Fit-to-content: shrink the form to wrap its children + a small margin. */}
      {children.length > 0 && (
        <button
          onClick={() => {
            let maxX = 0, maxY = 0
            for (const c of children) {
              const { w, h } = boxSize(c)
              maxX = Math.max(maxX, (Number(c.x) || 0) + w)
              maxY = Math.max(maxY, (Number(c.y) || 0) + h)
            }
            onResizeForm(Math.max(80, Math.round(maxX + 16)), Math.max(60, Math.round(maxY + 16)))
          }}
          className="ml-3 self-start px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-gray-300"
          title="Ajustar o tamanho do formulário ao conteúdo">
          ⤢ Ajustar ao conteúdo
        </button>
      )}
    </div>
  )
}
