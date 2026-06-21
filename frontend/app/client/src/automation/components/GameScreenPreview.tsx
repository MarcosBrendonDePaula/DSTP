// Fullscreen "game screen" editor — the WHOLE UI editor on the real DST screen.
// Left: palette + position. Center: the game's 1280×720 UI space with the panel placed
// by PERCENT of the screen (relative to its parent = the screen): pct_x/pct_y put the
// panel's CENTER at that % (0,0 = top-left, 50,50 = center). The panel is draggable —
// dragging sets pct_x/pct_y. Anchor presets are shortcuts that fill the percent. Right:
// inspector. The mod renders the same percent model (ui_widgets.lua CreateTree).
import { useEffect, useRef, useState } from 'react'

const SCREEN_W = 1280
const SCREEN_H = 720
const MARGIN = 120

// Anchor preset → screen percent (panel center). Mirrors the on-screen safe margin.
const MPCT_X = (MARGIN / SCREEN_W) * 100   // ~9.4%
const MPCT_Y = (MARGIN / SCREEN_H) * 100   // ~16.7%
const ANCHOR_PCT: Record<string, { x: number; y: number; label: string }> = {
  topleft: { x: MPCT_X, y: MPCT_Y, label: '↖' },
  top: { x: 50, y: MPCT_Y, label: '↑' },
  topright: { x: 100 - MPCT_X, y: MPCT_Y, label: '↗' },
  left: { x: MPCT_X, y: 50, label: '←' },
  center: { x: 50, y: 50, label: '•' },
  right: { x: 100 - MPCT_X, y: 50, label: '→' },
  bottomleft: { x: MPCT_X, y: 100 - MPCT_Y, label: '↙' },
  bottom: { x: 50, y: 100 - MPCT_Y, label: '↓' },
  bottomright: { x: 100 - MPCT_X, y: 100 - MPCT_Y, label: '↘' },
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v))

export function GameScreenEditor({
  pctX, pctY, onSetParam, onClose, palette, inspector, children, formW, formH, onResize,
}: {
  pctX?: string | number
  pctY?: string | number
  onSetParam?: (kv: Record<string, string>) => void
  onClose: () => void
  palette: React.ReactNode
  inspector: React.ReactNode
  children: React.ReactNode
  formW: number
  formH: number
  onResize?: (w: number, h: number) => void
}) {
  const [zoom, setZoom] = useState(0.5)
  const [autoFit, setAutoFit] = useState(true)

  // Default to center if unset.
  const px = pctX === '' || pctX == null ? 50 : Number(pctX)
  const py = pctY === '' || pctY == null ? 50 : Number(pctY)

  // Measure the REAL rendered size of the panel (it may auto-size from its content
  // when width/height aren't fixed) so we centre it correctly and don't collapse it
  // to 0×0. Falls back to formW/formH until the first measurement.
  const panelRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!panelRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r && r.width && r.height) setMeasured({ w: r.width, h: r.height })
    })
    ro.observe(panelRef.current)
    return () => ro.disconnect()
  }, [])
  const w = measured?.w || formW
  const h = measured?.h || formH

  // Panel CENTER on screen (px), then top-left for absolute placement.
  const centerX = (px / 100) * SCREEN_W
  const centerY = (py / 100) * SCREEN_H
  const panelLeft = centerX - w / 2
  const panelTop = centerY - h / 2

  useEffect(() => {
    const fit = () => {
      if (!autoFit) return
      const availW = window.innerWidth - 460
      const availH = window.innerHeight - 130
      setZoom(Math.max(0.25, Math.min(availW / SCREEN_W, availH / SCREEN_H, 1)))
    }
    fit()
    window.addEventListener('resize', fit)
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('keydown', onEsc) }
  }, [onClose, autoFit])

  // Drag the panel → set pct_x/pct_y from the new center position.
  const dragging = useRef<{ startX: number; startY: number; cx: number; cy: number } | null>(null)
  const onPanelDown = (e: React.PointerEvent) => {
    if (!onSetParam) return
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragging.current = { startX: e.clientX, startY: e.clientY, cx: centerX, cy: centerY }
  }
  const onPanelMove = (e: React.PointerEvent) => {
    if (!dragging.current || !onSetParam) return
    let nx = dragging.current.cx + (e.clientX - dragging.current.startX) / zoom
    let ny = dragging.current.cy + (e.clientY - dragging.current.startY) / zoom
    // Border collider: clamp the CENTER so the whole panel box stays on screen.
    const halfW = Math.min(w / 2, SCREEN_W / 2)
    const halfH = Math.min(h / 2, SCREEN_H / 2)
    nx = Math.max(halfW, Math.min(SCREEN_W - halfW, nx))
    ny = Math.max(halfH, Math.min(SCREEN_H - halfH, ny))
    onSetParam({
      pct_x: String(Math.round((nx / SCREEN_W) * 1000) / 10),
      pct_y: String(Math.round((ny / SCREEN_H) * 1000) / 10),
    })
  }
  const onPanelUp = (e: React.PointerEvent) => {
    dragging.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  // Resize from the SE corner → set the panel's width/height (px) on the tree root.
  const resizing = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null)
  const onResizeDown = (e: React.PointerEvent) => {
    if (!onResize) return
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    resizing.current = { startX: e.clientX, startY: e.clientY, w, h }
  }
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizing.current || !onResize) return
    const nw = Math.max(40, Math.round(resizing.current.w + (e.clientX - resizing.current.startX) / zoom))
    const nh = Math.max(30, Math.round(resizing.current.h + (e.clientY - resizing.current.startY) / zoom))
    onResize(nw, nh)
  }
  const onResizeUp = (e: React.PointerEvent) => {
    resizing.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  const setZoomManual = (z: number) => { setAutoFit(false); setZoom(z) }
  const [hover, setHover] = useState(false)
  // Which anchor preset (if any) matches the current percent.
  const activePreset = Object.entries(ANCHOR_PCT).find(([, p]) => Math.abs(p.x - px) < 0.5 && Math.abs(p.y - py) < 0.5)?.[0]

  return (
    <div className="fixed inset-0 z-[90] bg-[#0b0c10] flex flex-col">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10 text-xs shrink-0">
        <span className="text-gray-200 font-semibold">UI Builder — Tela do jogo</span>
        <span className="text-gray-500">1280×720 · pos: <b className="text-gray-300">{px}%, {py}%</b></span>
        <div className="flex gap-1 ml-2">
          <button onClick={() => setAutoFit(true)}
            className={`text-[10px] px-2 py-0.5 rounded border ${autoFit ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>Ajustar</button>
          {[0.4, 0.6, 0.8, 1].map(z => (
            <button key={z} onClick={() => setZoomManual(z)}
              className={`text-[10px] px-2 py-0.5 rounded border ${!autoFit && Math.abs(zoom - z) < 0.01 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
              {Math.round(z * 100)}%
            </button>
          ))}
        </div>
        <button onClick={onClose} className="ml-auto text-[10px] px-2.5 py-1 rounded border bg-white/5 text-gray-300 border-white/10 hover:bg-white/10">Fechar (Esc)</button>
      </div>

      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {/* left: palette + position controls */}
        <div className="w-44 shrink-0 overflow-auto space-y-3">
          {palette}
          {onSetParam && (
            <div className="border border-white/10 rounded-lg p-2 bg-black/20">
              <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1.5">Posição (% da tela)</div>
              {/* anchor preset shortcuts */}
              <div className="grid grid-cols-3 gap-1 mb-2">
                {Object.entries(ANCHOR_PCT).map(([id, p]) => (
                  <button key={id} onClick={() => onSetParam({ pct_x: String(p.x), pct_y: String(p.y) })}
                    title={id}
                    className={`h-7 rounded text-xs border ${activePreset === id ? 'bg-indigo-500/30 text-indigo-200 border-indigo-400/40' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <label className="flex items-center gap-1 flex-1 text-[10px] text-gray-500">
                  X%<input value={String(px)} onChange={e => onSetParam({ pct_x: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded px-1.5 py-1 text-[10px] text-white font-mono focus:border-blue-500/40 focus:outline-none" />
                </label>
                <label className="flex items-center gap-1 flex-1 text-[10px] text-gray-500">
                  Y%<input value={String(py)} onChange={e => onSetParam({ pct_y: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded px-1.5 py-1 text-[10px] text-white font-mono focus:border-blue-500/40 focus:outline-none" />
                </label>
              </div>
              <div className="text-[8px] text-gray-600 mt-1.5 leading-tight">Arraste pela barra "⠿ mover". X/Y % da tela ao centro do painel.</div>
            </div>
          )}
          <div className="text-[9px] text-gray-500 leading-snug px-1">
            👉 Clique no <b className="text-gray-300">painel</b> na tela para editar <b className="text-gray-300">Largura / Altura / Título</b> no inspector à direita.
          </div>
        </div>

        {/* center: game screen */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-black/30 rounded-lg">
          <div className="rounded-lg overflow-hidden border border-white/15 shadow-2xl m-4"
            style={{ width: SCREEN_W * zoom, height: SCREEN_H * zoom }}>
            <div style={{
              width: SCREEN_W, height: SCREEN_H, transform: `scale(${zoom})`, transformOrigin: 'top left',
              position: 'relative',
              background: 'radial-gradient(circle at 50% 40%, #2a2f3a 0%, #16181d 70%, #0d0e12 100%)',
            }}>
              <div style={{ position: 'absolute', inset: MARGIN / 2, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8, pointerEvents: 'none' }} />
              {/* crosshair at the panel center */}
              <div style={{ position: 'absolute', left: centerX - 4, top: centerY - 4, width: 8, height: 8, borderRadius: 4, background: '#818cf8', boxShadow: '0 0 0 2px rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
              {/* the panel, placed by percent. The move bar + resize handle live INSIDE
                  the panel (so they never go off-screen) and show on hover; the body is
                  free so clicking a child selects it (inspector). */}
              <div ref={panelRef}
                onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
                style={{ position: 'absolute', left: panelLeft, top: panelTop, width: 'fit-content', height: 'fit-content' }}>
                {onSetParam && (
                  <div
                    onPointerDown={onPanelDown}
                    onPointerMove={onPanelMove}
                    onPointerUp={onPanelUp}
                    title="Arraste para mover na tela"
                    style={{
                      position: 'absolute', left: 0, right: 0, top: 0, height: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      background: 'rgba(99,102,241,0.9)', borderRadius: '6px 6px 0 0',
                      color: '#fff', fontSize: 10, cursor: 'move', touchAction: 'none', userSelect: 'none',
                      opacity: hover ? 1 : 0, transition: 'opacity 0.12s', zIndex: 5,
                    }}
                  >
                    ⠿ mover
                  </div>
                )}
                {children}
                {/* SE resize handle */}
                {onResize && (
                  <div
                    onPointerDown={onResizeDown}
                    onPointerMove={onResizeMove}
                    onPointerUp={onResizeUp}
                    title={`${w}×${h}`}
                    style={{
                      position: 'absolute', right: -4, bottom: -4, width: 14, height: 14,
                      background: '#6366f1', border: '2px solid #fff', borderRadius: 3,
                      cursor: 'nwse-resize', touchAction: 'none', zIndex: 5,
                      opacity: hover ? 1 : 0.4, transition: 'opacity 0.12s',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* right: inspector */}
        <div className="w-64 shrink-0 overflow-auto">{inspector}</div>
      </div>
    </div>
  )
}
