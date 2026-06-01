import { useCallback, useState } from 'react'
import { useReactFlow } from '@xyflow/react'

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
    case 'panel': return { type, title: 'Painel', children: [] }
    case 'col': return { type, gap: 8, children: [] }
    case 'row': return { type, gap: 12, children: [] }
    case 'tabs': return { type, active: 0, tabs: [{ label: 'Aba 1', child: { type: 'col', gap: 6, children: [] } }] }
    case 'text': return { type, text: 'Texto', size: 18 }
    case 'icon': return { type, prefab: 'log', size: 48 }
    case 'image': return { type, atlas: 'images/global.xml', tex: 'square.tex', width: 64, height: 64 }
    case 'button': return { type, text: 'Botão', callback: 'click' }
    case 'bar': return { type, value: 1, max: 1 }
    case 'spacer': return { type, height: 8 }
    default: return { type }
  }
}

// Editable prop fields per type (key, label, placeholder).
const FIELDS: Record<string, { key: string; label: string; ph?: string }[]> = {
  panel: [{ key: 'title', label: 'Título' }, { key: 'gap', label: 'Gap', ph: '8' }],
  col: [{ key: 'gap', label: 'Gap', ph: '8' }, { key: 'tab_label', label: 'Rótulo (se aba)' }],
  row: [{ key: 'gap', label: 'Gap', ph: '12' }],
  tabs: [{ key: 'active', label: 'Aba inicial', ph: '0' }],
  text: [{ key: 'text', label: 'Texto', ph: '{{x}}' }, { key: 'size', label: 'Tamanho', ph: '18' }, { key: 'color', label: 'Cor [r,g,b,a]', ph: '[1,1,1,1]' }, { key: 'id', label: 'Node ID (p/ atualizar)' }, { key: 'callback', label: 'Callback (clicável)' }],
  icon: [{ key: 'prefab', label: 'Prefab', ph: 'log' }, { key: 'size', label: 'Tamanho', ph: '48' }, { key: 'id', label: 'Node ID' }, { key: 'callback', label: 'Callback' }],
  image: [{ key: 'atlas', label: 'Atlas' }, { key: 'tex', label: 'Textura' }, { key: 'width', label: 'Largura' }, { key: 'height', label: 'Altura' }],
  button: [{ key: 'text', label: 'Texto', ph: 'Comprar' }, { key: 'callback', label: 'Callback', ph: 'buy_log' }, { key: 'width', label: 'Largura', ph: '120' }, { key: 'id', label: 'Node ID' }],
  bar: [{ key: 'value', label: 'Valor', ph: '{{p.health_current}}' }, { key: 'max', label: 'Max', ph: '{{p.health_max}}' }, { key: 'color', label: 'Cor [r,g,b,a]' }, { key: 'id', label: 'Node ID' }],
  spacer: [{ key: 'height', label: 'Altura', ph: '8' }],
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

export function UITreeEditor({ nodeId, tree }: { nodeId: string; tree: UINode | null }) {
  const { updateNodeData, getNode: rfGetNode } = useReactFlow()
  const [selPath, setSelPath] = useState<Step[]>([])
  const [addType, setAddType] = useState('text')

  const root: UINode = tree && tree.type ? tree : { type: 'panel', title: 'Painel', children: [] }

  const save = useCallback((next: UINode) => {
    const n = rfGetNode(nodeId)
    updateNodeData(nodeId, { ...(n?.data || {}), tree: next })
  }, [nodeId, rfGetNode, updateNodeData])

  const selected = getNode(root, selPath)

  const setProp = (key: string, value: string) => {
    save(update(root, r => {
      const t = getNode(r, selPath)
      if (!t) return
      if (value === '') delete t[key]
      else t[key] = value
    }))
  }

  const addChild = () => {
    save(update(root, r => {
      const t = getNode(r, selPath) || r
      const fresh = defaults(addType)
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

  // Recursive tree rows
  const renderRow = (n: UINode, path: Step[], label?: string): React.ReactNode => {
    const depth = path.length
    const isSel = samePath(path, selPath)
    const kids: React.ReactNode[] = []
    if (n.children) n.children.forEach((c: UINode, i: number) => kids.push(renderRow(c, [...path, { kind: 'child', i }])))
    if (n.tabs) n.tabs.forEach((tb: any, i: number) => kids.push(renderRow(tb.child, [...path, { kind: 'tab', i }], tb.label)))
    return (
      <div key={path.map(s => s.kind + s.i).join('/') || 'root'}>
        <div
          onClick={() => setSelPath(path)}
          className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer text-[11px] ${isSel ? 'bg-indigo-500/30 text-white' : 'hover:bg-white/5 text-gray-300'}`}
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

  return (
    <div className="flex gap-3 text-xs" style={{ minHeight: 300 }}>
      {/* Tree */}
      <div className="flex-1 border border-white/10 rounded-lg p-2 bg-black/20 overflow-auto" style={{ maxHeight: 460 }}>
        <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Estrutura</div>
        {renderRow(root, [])}
      </div>

      {/* Inspector */}
      <div className="w-56 shrink-0 space-y-2">
        {selected ? (
          <>
            <div className="text-[10px] text-indigo-300 font-semibold">{ICON[selected.type]} {selected.type}</div>
            {(FIELDS[selected.type] || []).map(f => (
              <div key={f.key}>
                <span className="text-[9px] text-gray-500 block mb-0.5">{f.label}</span>
                <input
                  value={selected[f.key] ?? ''}
                  onChange={e => setProp(f.key, e.target.value)}
                  placeholder={f.ph}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-indigo-400/40 focus:outline-none placeholder:text-gray-600"
                />
              </div>
            ))}
            {selIsContainer && (
              <div className="pt-2 border-t border-white/10">
                <span className="text-[9px] text-gray-500 block mb-1">Adicionar {selected.type === 'tabs' ? 'aba' : 'filho'}</span>
                <div className="flex gap-1">
                  <select value={addType} onChange={e => setAddType(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-1 py-1 text-[10px] text-white [&>option]:bg-[#1a1a1a]">
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button onClick={addChild} className="px-2 rounded bg-indigo-500/25 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-500/35 text-[11px]">+</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-[10px] text-gray-500">Selecione um componente na árvore para editar.</div>
        )}
      </div>
    </div>
  )
}
