import { useCallback, useState } from 'react'
import { UICanvas } from './UICanvas'

// Visual tree editor for a ui_builder node. Builds node.data.tree — the same
// {type, ...props, children} the backend renders. No canvas spam, no JSON: pick
// a component, nest it, edit its props. Containers hold children; tabs hold
// tabs:[{label, child}].

type UINode = Record<string, any>

const CONTAINER = new Set(['panel', 'col', 'row', 'tabs'])
const TYPES: { value: string; label: string; container?: boolean }[] = [
  { value: 'panel', label: '🪟 Painel', container: true },
  { value: 'col', label: '↕ Coluna', container: true },
  { value: 'row', label: '↔ Linha', container: true },
  { value: 'tabs', label: '🗂 Abas', container: true },
  { value: 'text', label: '🔤 Texto' },
  { value: 'text_input', label: '⌨ Campo de Texto' },
  { value: 'icon', label: '🖼 Ícone' },
  { value: 'image', label: '🏞 Imagem' },
  { value: 'button', label: '🔘 Botão' },
  { value: 'bar', label: '📊 Barra' },
  { value: 'spacer', label: '␣ Espaço' },
]
const ICON: Record<string, string> = Object.fromEntries(TYPES.map(t => [t.value, t.label.split(' ')[0]]))

// Default props per type when adding a new node.
function defaults(type: string): UINode {
  switch (type) {
    case 'panel': return { type, title: 'Painel', mode: 'canvas', width: 260, height: 180, children: [] }
    case 'col': return { type, gap: 8, children: [] }
    // A "grid" palette item is really a col in grid mode (cols columns of blocked children).
    case 'grid': return { type: 'col', mode: 'grid', grid_rows: ['50 50'], gap: 8, width: 200, height: 120, children: [] }
    case 'row': return { type, gap: 12, children: [] }
    case 'tabs': return { type, active: 0, tabs: [{ label: 'Aba 1', child: { type: 'col', gap: 6, children: [] } }] }
    case 'text': return { type, text: 'Texto', size: 18 }
    case 'text_input': return { type, callback: 'submit', placeholder: 'digite...', width: 280, height: 36 }
    case 'icon': return { type, prefab: 'log', size: 48 }
    case 'image': return { type, atlas: 'images/global.xml', tex: 'square.tex', width: 64, height: 64 }
    case 'button': return { type, text: 'Botão', callback: 'click' }
    case 'bar': return { type, value: 1, max: 1 }
    case 'spacer': return { type, height: 8 }
    default: return { type }
  }
}

// Editable prop fields per type (key, label, placeholder). Kept as free-text inputs so
// any field — including booleans like draggable/closeable — can take a template
// ({{...}}) instead of a fixed value.
const FIELDS: Record<string, { key: string; label: string; ph?: string }[]> = {
  panel: [{ key: 'title', label: 'Título' }, { key: 'body', label: 'Corpo (texto)' }, { key: 'width', label: 'Largura (fixo)', ph: 'auto' }, { key: 'height', label: 'Altura (fixo)', ph: 'auto' }, { key: 'gap', label: 'Gap', ph: '8' }, { key: 'draggable', label: 'Arrastável (true)', ph: 'false' }, { key: 'closeable', label: 'Botão fechar — false p/ ocultar o X', ph: 'true' }],
  col: [{ key: 'mode', label: 'Disposição' }, { key: 'gap', label: 'Gap', ph: '8' }, { key: 'width', label: 'Largura (fixo)', ph: 'auto' }, { key: 'height', label: 'Altura (fixo)', ph: 'auto' }, { key: 'tab_label', label: 'Rótulo (se aba)' }],
  row: [{ key: 'mode', label: 'Disposição' }, { key: 'gap', label: 'Gap', ph: '12' }, { key: 'width', label: 'Largura (fixo)', ph: 'auto' }, { key: 'height', label: 'Altura (fixo)', ph: 'auto' }],
  tabs: [{ key: 'active', label: 'Aba inicial', ph: '0' }],
  text: [{ key: 'text', label: 'Texto', ph: '{{x}}' }, { key: 'size', label: 'Tamanho fonte', ph: '18' }, { key: 'color', label: 'Cor [r,g,b,a]', ph: '[1,1,1,1]' }, { key: 'width', label: 'Largura caixa', ph: 'auto' }, { key: 'height', label: 'Altura caixa', ph: 'auto' }, { key: 'id', label: 'Node ID (p/ atualizar)' }, { key: 'callback', label: 'Callback (clicável)' }],
  text_input: [{ key: 'id', label: 'ID do campo (retorna em fields.<id>)', ph: 'senha' }, { key: 'callback', label: 'Callback (Enter envia)', ph: 'submit:nome' }, { key: 'placeholder', label: 'Placeholder', ph: 'digite...' }, { key: 'value', label: 'Valor inicial' }, { key: 'size', label: 'Tamanho fonte', ph: '22' }, { key: 'color', label: 'Cor fonte [r,g,b,a]', ph: '[1,1,1,1]' }, { key: 'width', label: 'Largura', ph: '280' }, { key: 'height', label: 'Altura', ph: '36' }, { key: 'max', label: 'Max caracteres' }],
  icon: [{ key: 'prefab', label: 'Prefab', ph: 'log' }, { key: 'size', label: 'Tamanho', ph: '48' }, { key: 'width', label: 'Largura', ph: 'auto' }, { key: 'height', label: 'Altura', ph: 'auto' }, { key: 'id', label: 'Node ID' }, { key: 'callback', label: 'Callback' }],
  image: [{ key: 'atlas', label: 'Atlas' }, { key: 'tex', label: 'Textura' }, { key: 'width', label: 'Largura' }, { key: 'height', label: 'Altura' }],
  button: [{ key: 'text', label: 'Texto', ph: 'Comprar' }, { key: 'callback', label: 'Callback', ph: 'buy_log' }, { key: 'width', label: 'Largura', ph: '120' }, { key: 'height', label: 'Altura', ph: '44' }, { key: 'size', label: 'Tamanho fonte', ph: '20' }, { key: 'color', label: 'Cor [r,g,b,a]' }, { key: 'id', label: 'Node ID' }],
  bar: [{ key: 'value', label: 'Valor', ph: '{{p.health_current}}' }, { key: 'max', label: 'Max', ph: '{{p.health_max}}' }, { key: 'width', label: 'Largura', ph: '200' }, { key: 'height', label: 'Altura', ph: '16' }, { key: 'label', label: 'Rótulo (dentro)' }, { key: 'color', label: 'Cor [r,g,b,a]' }, { key: 'id', label: 'Node ID' }],
  spacer: [{ key: 'width', label: 'Largura', ph: '0' }, { key: 'height', label: 'Altura', ph: '8' }],
}

// Every component can be scaled (SetScale in the mod). Append `scale` to all field
// lists so it shows in the inspector without editing each array above.
for (const k of Object.keys(FIELDS)) {
  FIELDS[k].push({ key: 'scale', label: 'Escala (1 = normal)', ph: '1' })
}

// ─── path helpers: a path is a list of steps into the tree ──────────────────
// step = { kind:'child', i } or { kind:'tab', i } (the tab's child container)
type Step = { kind: 'child' | 'tab'; i: number }

function getNode(root: UINode, path: Step[]): UINode | null {
  let cur: UINode | null = root
  for (const s of path) {
    if (!cur) return null
    if (s.kind === 'child') cur = (cur.children || [])[s.i] ?? null
    else cur = (cur.tabs || [])[s.i]?.child ?? null
  }
  return cur
}

// Apply a mutation by cloning along the path (immutable update).
function update(root: UINode, fn: (r: UINode) => void): UINode {
  const clone = structuredClone(root)
  fn(clone)
  return clone
}

export function UITreeEditor({ nodeId, tree, onChange, forceTab }: { nodeId: string; tree: UINode | null; onChange: (tree: UINode) => void; forceTab?: 'tree' | 'render' }) {
  const [selPath, setSelPath] = useState<Step[]>([])
  const [tabState, setTab] = useState<'tree' | 'render'>('tree')
  // When the host (detail modal) owns the tab switching, it passes forceTab and we
  // hide our own tab bar. Otherwise we manage the tab ourselves.
  const tab = forceTab ?? tabState
  // Drag-and-drop: which palette type is being dragged, and which container row is the
  // current drop target (for the highlight). pathKey = the dropPath serialized.
  const [dragType, setDragType] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const [movePath, setMovePath] = useState<Step[] | null>(null)  // a tree row being dragged to move
  const pathKey = (p: Step[]) => p.map(s => s.kind + s.i).join('/') || 'root'

  const root: UINode = tree && tree.type ? tree : { type: 'panel', title: 'Painel', children: [] }

  const save = useCallback((next: UINode) => {
    onChange(next)
  }, [onChange])

  const selected = getNode(root, selPath)
  // Parent of the selected node — when it's a canvas container, the selected child gets
  // absolute x,y fields in the inspector.
  const selParent = selPath.length > 0 ? getNode(root, selPath.slice(0, -1)) : null
  const parentIsCanvas = !!selParent && selParent.mode === 'canvas' && selPath[selPath.length - 1]?.kind === 'child'
  // Parent is a "blocked" container (stacked col/row OR grid) — the child's position is the
  // grid/stack computing it from ORDER, so moving = reordering (↑/↓), not free x,y.
  const parentIsBlocked = !!selParent && CONTAINER.has(selParent.type) && selParent.mode !== 'canvas'
    && selPath[selPath.length - 1]?.kind === 'child'

  const setProp = (key: string, value: string) => {
    save(update(root, r => {
      const t = getNode(r, selPath)
      if (!t) return
      if (value === '') delete t[key]
      else t[key] = value
    }))
  }

  // Add a new node of `type` into the container at `path` (defaults to the selected
  // node, then the root). Used by both the palette click and the drag-drop.
  const addChildAt = (path: Step[], type: string) => {
    save(update(root, r => {
      const t = getNode(r, path) || r
      const fresh = defaults(type)
      if (t.type === 'tabs') {
        t.tabs = t.tabs || []
        t.tabs.push({ label: `Aba ${t.tabs.length + 1}`, child: fresh.type === 'col' || fresh.type === 'row' ? fresh : { type: 'col', gap: 6, children: [fresh] } })
      } else if (CONTAINER.has(t.type)) {
        t.children = t.children || []
        t.children.push(fresh)
      }
    }))
  }


  const removeAt = (path: Step[]) => {
    if (path.length === 0) return // can't remove root
    save(update(root, r => {
      const parentPath = path.slice(0, -1)
      const last = path[path.length - 1]
      const parent = getNode(r, parentPath) || r
      if (last.kind === 'tab' && parent.tabs) parent.tabs.splice(last.i, 1)
      else if (parent.children) parent.children.splice(last.i, 1)
    }))
    setSelPath([])
  }

  const move = (path: Step[], dir: -1 | 1) => {
    if (path.length === 0) return
    save(update(root, r => {
      const last = path[path.length - 1]
      const parent = getNode(r, path.slice(0, -1)) || r
      const arr = last.kind === 'tab' ? parent.tabs : parent.children
      if (!arr) return
      const j = last.i + dir
      if (j < 0 || j >= arr.length) return
      ;[arr[last.i], arr[j]] = [arr[j], arr[last.i]]
    }))
  }

  const samePath = (a: Step[], b: Step[]) => a.length === b.length && a.every((s, i) => s.kind === b[i].kind && s.i === b[i].i)
  const isAncestor = (a: Step[], b: Step[]) => a.length < b.length && a.every((s, i) => s.kind === b[i].kind && s.i === b[i].i)

  // Move an EXISTING node (at fromPath) INTO the container at destPath (drag a tree row
  // onto another container row). Detaches from its old parent, appends to the new one.
  // No-ops if you drop a node onto itself or a descendant (would orphan the subtree).
  const moveNodeInto = (fromPath: Step[], destPath: Step[]) => {
    if (fromPath.length === 0) return                         // can't move the root
    if (samePath(fromPath, destPath) || isAncestor(fromPath, destPath)) return
    save(update(root, r => {
      // Resolve BOTH nodes by object reference on this clone, so a splice that shifts
      // indices doesn't invalidate the destination.
      const moving = getNode(r, fromPath)
      const dest = getNode(r, destPath) || r
      if (!moving || !CONTAINER.has(dest.type)) return
      // detach from old parent
      const fp = fromPath[fromPath.length - 1]
      const oldParent = getNode(r, fromPath.slice(0, -1)) || r
      if (fp.kind === 'tab') { if (oldParent.tabs) oldParent.tabs.splice(fp.i, 1) }
      else if (oldParent.children) oldParent.children.splice(fp.i, 1)
      // append to the destination (dest is the same object ref, valid after the splice)
      if (dest.type === 'tabs') {
        dest.tabs = dest.tabs || []
        dest.tabs.push({ label: `Aba ${dest.tabs.length + 1}`,
          child: moving.type === 'col' || moving.type === 'row' ? moving : { type: 'col', gap: 6, children: [moving] } })
      } else {
        dest.children = dest.children || []
        dest.children.push(moving)
      }
    }))
    setSelPath([])
  }

  // Recursive tree rows
  const renderRow = (n: UINode, path: Step[], label?: string): React.ReactNode => {
    const depth = path.length
    const isSel = samePath(path, selPath)
    const kids: React.ReactNode[] = []
    if (n.children) n.children.forEach((c: UINode, i: number) => kids.push(renderRow(c, [...path, { kind: 'child', i }])))
    if (n.tabs) n.tabs.forEach((tb: any, i: number) => kids.push(renderRow(tb.child, [...path, { kind: 'tab', i }], tb.label)))
    const isContainer = CONTAINER.has(n.type)
    // A container is a drop target for the palette (new block) AND for moving an existing
    // row into it. Highlight while either drag hovers it.
    const isDropTarget = isContainer && (dragType != null || movePath != null) && dropKey === pathKey(path)
    return (
      <div key={pathKey(path)}>
        <div
          onClick={() => setSelPath(path)}
          // Drag THIS row (existing node) to move it into another container.
          draggable={path.length > 0}
          onDragStart={path.length > 0 ? (e => { e.stopPropagation(); setMovePath(path); e.dataTransfer.setData('text/dstp-treemove', pathKey(path)); e.dataTransfer.effectAllowed = 'move' }) : undefined}
          onDragEnd={() => { setMovePath(null); setDropKey(null) }}
          onDragOver={isContainer ? (e => { e.preventDefault(); e.stopPropagation(); if (dropKey !== pathKey(path)) setDropKey(pathKey(path)) }) : undefined}
          onDragLeave={isContainer ? (e => { e.stopPropagation(); if (dropKey === pathKey(path)) setDropKey(null) }) : undefined}
          onDrop={isContainer ? (e => {
            e.preventDefault(); e.stopPropagation()
            if (movePath) {
              moveNodeInto(movePath, path)          // move an existing node here
            } else {
              const t = dragType || e.dataTransfer.getData('text/plain')
              if (t) addChildAt(path, t)             // drop a new block from the palette
              setSelPath(path)
            }
            setDragType(null); setMovePath(null); setDropKey(null)
          }) : undefined}
          className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer text-[11px] ${isDropTarget ? 'bg-emerald-500/30 ring-1 ring-emerald-400 text-white' : isSel ? 'bg-indigo-500/30 text-white' : 'hover:bg-white/5 text-gray-300'}`}
          style={{ paddingLeft: 6 + depth * 14 }}
        >
          <span>{ICON[n.type] || '•'}</span>
          <span className="font-medium">{label ? `[${label}] ` : ''}{n.type}</span>
          <span className="text-gray-500 truncate flex-1">{n.text || n.prefab || n.title || ''}</span>
          {path.length > 0 && (
            <>
              <button onClick={e => { e.stopPropagation(); move(path, -1) }} className="text-gray-500 hover:text-white px-0.5" title="Subir">↑</button>
              <button onClick={e => { e.stopPropagation(); move(path, 1) }} className="text-gray-500 hover:text-white px-0.5" title="Descer">↓</button>
              <button onClick={e => { e.stopPropagation(); removeAt(path) }} className="text-red-400 hover:text-red-300 px-0.5" title="Remover">✕</button>
            </>
          )}
        </div>
        {kids}
      </div>
    )
  }

  const selIsContainer = selected && CONTAINER.has(selected.type)

  // ─── Canvas designer handlers (operate on the ROOT's direct children) ───
  const canvasMoveChild = (i: number, x: number, y: number) => {
    save(update(root, r => { const c = (r.children || [])[i]; if (c) { c.x = x; c.y = y } }))
  }
  const canvasResizeChild = (i: number, w: number, h: number) => {
    save(update(root, r => {
      const c = (r.children || [])[i]
      if (!c) return
      // icon uses `size` (square); others use width/height. Strip the per-component scale so
      // resize sets the real box, not box×scale.
      const s = Number(c.scale) || 1
      if (c.type === 'icon') c.size = Math.round(w / s)
      else { c.width = Math.round(w / s); c.height = Math.round(h / s) }
    }))
  }
  // Add a block INTO a root container child (drop onto a grid/group on the canvas).
  const canvasAddChildInto = (i: number, type: string) => {
    save(update(root, r => {
      const cont = (r.children || [])[i]
      if (!cont) return
      cont.children = cont.children || []
      cont.children.push(defaults(type))
    }))
  }
  // Resize the form (root) — sets root width/height.
  const canvasResizeForm = (w: number, h: number) => {
    save(update(root, r => { r.width = w; r.height = h }))
  }
  // Drop a new block from the palette onto the form at x,y.
  const canvasAddChild = (type: string, x: number, y: number) => {
    save(update(root, r => {
      r.children = r.children || []
      r.children.push({ ...defaults(type), x, y })
    }))
    setSelPath([{ kind: 'child', i: (root.children?.length || 0) }])
  }

  // Drop into a grid cell (gr=row, gc=col). Either move an existing child of the grid into
  // the cell, or create a new child from a palette type. gridPath points at the grid node.
  const canvasCellDrop = (gridPath: Step[], gc: number, gr: number, opts: { childIndex?: number; addType?: string }) => {
    save(update(root, r => {
      const grid = getNode(r, gridPath)
      if (!grid) return
      grid.children = grid.children || []
      if (opts.addType) {
        grid.children.push({ ...defaults(opts.addType), gr, gc })
      } else if (opts.childIndex != null) {
        const c = grid.children[opts.childIndex]
        if (c) { c.gr = gr; c.gc = gc }
      }
    }))
  }

  // Mutate the selected grid container's row width-specs (Bootstrap-like rows).
  const gridRows: string[] = Array.isArray(selected?.grid_rows) ? selected.grid_rows : []
  const setGridRows = (next: string[]) => {
    save(update(root, r => { const t = getNode(r, selPath); if (t) t.grid_rows = next }))
  }

  // Shared inspector (used by both tabs).
  const inspector = (
    <div className="w-56 shrink-0 space-y-2">
      {selected ? (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-indigo-300 font-semibold">{ICON[selected.type]} {selected.type}</div>
            {selPath.length > 0 && (
              <button onClick={() => removeAt(selPath)} className="text-red-400 hover:text-red-300 text-[10px]" title="Remover">✕ remover</button>
            )}
          </div>
          {/* Grid row editor at the TOP — the primary control for a grid layout: each row is
              a width spec ("50 50", "25 25 25 25"). */}
          {selIsContainer && selected.mode === 'grid' && (
            <div className="pb-2 mb-1 border-b border-white/10 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-blue-300 font-semibold">Linhas da grade (larguras)</span>
                <button onClick={() => setGridRows([...gridRows, '50 50'])} className="text-[10px] text-blue-300 hover:text-blue-200" title="Adicionar linha">+ linha</button>
              </div>
              {gridRows.length === 0 && <div className="text-[8px] text-gray-600">Sem linhas — clique "+ linha". Ex: 50 50 · 25 25 25 25</div>}
              <div className="flex items-center gap-1 text-[7px] text-gray-600 uppercase tracking-wide">
                <span className="w-4"></span><span className="flex-1">larguras</span><span className="w-12">alt. peso</span><span className="w-3"></span>
              </div>
              {gridRows.map((rspec, ri) => {
                // Split the spec into widths and the optional "@height".
                const hm = String(rspec).match(/@\s*(\d+(?:\.\d+)?)/)
                const widths = String(rspec).replace(/@\s*\d+(?:\.\d+)?/, '').trim()
                const height = hm ? hm[1] : ''
                const compose = (w: string, h: string) => (h.trim() ? `${w.trim()} @${h.trim()}` : w.trim())
                return (
                  <div key={ri} className="flex items-center gap-1">
                    <span className="text-[8px] text-gray-500 w-4">{ri + 1}</span>
                    <input value={widths} onChange={e => { const n = [...gridRows]; n[ri] = compose(e.target.value, height); setGridRows(n) }}
                      placeholder="50 50" title="Larguras separadas por espaço (peso de cada coluna)"
                      className="flex-1 bg-white/5 border border-blue-400/20 rounded px-2 py-1 text-[10px] text-white focus:border-blue-400/50 focus:outline-none placeholder:text-gray-600" />
                    <input value={height} onChange={e => { const n = [...gridRows]; n[ri] = compose(widths, e.target.value); setGridRows(n) }}
                      placeholder="1" title="Peso da altura da linha (fr da altura total do grid; vazio = 1)"
                      className="w-12 bg-white/5 border border-blue-400/20 rounded px-1.5 py-1 text-[10px] text-white focus:border-blue-400/50 focus:outline-none placeholder:text-gray-600" />
                    <button onClick={() => setGridRows(gridRows.filter((_, i) => i !== ri))} className="text-red-400 hover:text-red-300 text-[10px]" title="Remover linha">✕</button>
                  </div>
                )
              })}
              <div className="text-[8px] text-gray-600 leading-tight">Largura = peso da coluna ("50 50" = iguais, "70 30" = 70/30). Altura = peso da linha (fração da altura do grid). Arraste blocos para as células.</div>
            </div>
          )}
          {parentIsBlocked && (
            // In a grid/stack the position comes from ORDER → move by reordering, not x,y.
            <div className="flex items-center gap-1 pb-2 border-b border-white/10">
              <span className="text-[9px] text-blue-300 flex-1">Posição na grade/pilha (pela ordem)</span>
              <button onClick={() => move(selPath, -1)} className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-200" title="Mover para trás">↑</button>
              <button onClick={() => move(selPath, 1)} className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-200" title="Mover para frente">↓</button>
            </div>
          )}
          {parentIsCanvas && (
            <div className="grid grid-cols-2 gap-1 pb-1 border-b border-white/10">
              {(['x', 'y'] as const).map(k => (
                <div key={k}>
                  <span className="text-[9px] text-emerald-400 block mb-0.5">{k === 'x' ? 'X (px)' : 'Y (px)'}</span>
                  <input
                    value={selected[k] ?? ''}
                    onChange={e => setProp(k, e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/5 border border-emerald-400/20 rounded px-2 py-1 text-[10px] text-white focus:border-emerald-400/50 focus:outline-none placeholder:text-gray-600"
                  />
                </div>
              ))}
            </div>
          )}
          {(FIELDS[selected.type] || []).map(f => {
            // `cols` only matters in grid mode — hide it otherwise.
            return (
            <div key={f.key}>
              <span className="text-[9px] text-gray-500 block mb-0.5">{f.label}</span>
              {f.key === 'mode' ? (
                // Container disposition: stacked / grid / free canvas. A closed choice.
                <select
                  value={selected.mode === 'grid' ? 'grid' : selected.mode === 'canvas' ? 'canvas' : 'layout'}
                  onChange={e => setProp('mode', e.target.value === 'layout' ? '' : e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-indigo-400/40 focus:outline-none"
                >
                  <option value="layout">Empilhado ({selected.type === 'row' ? 'lado a lado' : 'coluna'})</option>
                  <option value="grid">Grade (linhas com larguras)</option>
                  <option value="canvas">Livre (posição x,y)</option>
                </select>
              ) : (
                <input
                  value={selected[f.key] ?? ''}
                  onChange={e => setProp(f.key, e.target.value)}
                  placeholder={f.ph}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-indigo-400/40 focus:outline-none placeholder:text-gray-600"
                />
              )}
            </div>
          )})}
          {selIsContainer && (
            <div className="pt-2 border-t border-white/10 text-[8px] text-gray-500">
              Container selecionado — arraste um bloco da paleta para cá (na aba Árvore).
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-gray-500">Selecione um componente (na árvore ou no render) para editar.</div>
      )}
    </div>
  )

  return (
    <div className="text-xs" style={{ minHeight: 300 }}>
      {/* Tabs — hidden when the host (modal middle column) owns the switching. */}
      {!forceTab && (
        <div className="flex gap-1 mb-2">
          {([['tree', '🌳 Árvore'], ['render', '👁 Render']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-1 rounded-t text-[11px] border-b-2 ${tab === k ? 'border-indigo-400 text-white bg-white/5' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      {tab === 'tree' ? (
        <div className="flex gap-3">
          {/* Palette */}
          <div className="w-32 shrink-0 border border-white/10 rounded-lg p-1.5 bg-black/20">
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Blocos</div>
            <div className="space-y-1">
              {TYPES.map(t => (
                <div
                  key={t.value}
                  draggable
                  onDragStart={e => { setDragType(t.value); e.dataTransfer.setData('text/plain', t.value); e.dataTransfer.effectAllowed = 'copy' }}
                  onDragEnd={() => { setDragType(null); setDropKey(null) }}
                  onClick={() => addChildAt(selected && CONTAINER.has(selected.type) ? selPath : [], t.value)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing bg-white/5 hover:bg-indigo-500/20 border border-white/10 text-[10px] text-gray-200 select-none"
                  title={t.container ? 'Container — arraste para dentro de outro container' : 'Arraste para um container'}
                >
                  {t.label}
                </div>
              ))}
            </div>
            <div className="text-[8px] text-gray-600 mt-1.5 leading-tight">Arraste um bloco para um container na árvore, ou clique para adicionar ao selecionado.</div>
          </div>

          {/* Tree */}
          <div className="flex-1 border border-white/10 rounded-lg p-2 bg-black/20 overflow-auto" style={{ maxHeight: 460 }}>
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Estrutura</div>
            {renderRow(root, [])}
          </div>

          {inspector}
        </div>
      ) : (
        <div className="flex gap-3">
          {/* Palette — drag a block onto the form to create it at the drop point. */}
          <div className="w-28 shrink-0 border border-white/10 rounded-lg p-1.5 bg-black/20 self-start">
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Blocos</div>
            <div className="space-y-1">
              {/* Leaf blocks + group containers (col stacked, grid). Dropping a container on
                  the form creates a box you can fill with blocked children. */}
              {[...TYPES.filter(t => !t.container),
                { value: 'col', label: '▦ Grupo (empilha)' },
                { value: 'grid', label: '⊞ Grade (grid)' },
              ].map(t => (
                <div key={t.value} draggable
                  onDragStart={e => { e.dataTransfer.setData('text/plain', t.value); e.dataTransfer.effectAllowed = 'copy' }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing bg-white/5 hover:bg-emerald-500/20 border border-white/10 text-[10px] text-gray-200 select-none"
                  title="Arraste para o formulário">
                  {t.label}
                </div>
              ))}
            </div>
            <div className="text-[8px] text-gray-600 mt-1.5 leading-tight">Arraste para o formulário. Arraste o componente para mover, alça do canto para redimensionar.</div>
          </div>
          {/* Form designer (VB-style canvas) */}
          <div className="flex-1 min-w-[280px]">
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Formulário — arraste da paleta, mova e redimensione</div>
            <UICanvas root={root} sel={selPath} onSelect={setSelPath}
              onMoveChild={canvasMoveChild} onResizeChild={canvasResizeChild} onAddChild={canvasAddChild}
              onAddChildInto={canvasAddChildInto} onCellDrop={canvasCellDrop} onResizeForm={canvasResizeForm} />
          </div>
          {inspector}
        </div>
      )}
    </div>
  )
}
