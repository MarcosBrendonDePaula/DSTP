import { useMemo, useState, useRef } from 'react'
import { buildTree, folderOf, orderOf, type FlowLike, type FolderLike, type TreeNode } from './FlowTree'

// Windows-Explorer-style flow browser: a folder TREE on the left (folders only) and
// the SELECTED folder's CONTENTS on the right (its subfolders + flows), with a
// breadcrumb. Reuses buildTree + the same drag-and-drop / context-menu model as the
// old inline tree: drag a flow onto a folder to move it; drag a folder onto another
// to nest it; right-click a folder for New subfolder / Rename / Delete.

type Props = {
  flows: FlowLike[]
  folders?: FolderLike[]
  search: string
  onMove: (flowId: string, folderPath: string, sortOrder: number) => void
  onMoveFolder?: (path: string, newParent: string) => void
  onReorderFolder?: (path: string, sortOrder: number) => void
  onDeleteFolder?: (path: string) => void
  onCreateSubfolder?: (parentPath: string) => void
  onRenameFolder?: (path: string) => void
  renderFlow: (flow: FlowLike) => React.ReactNode
}

const nodeByPath = (root: TreeNode, path: string): TreeNode | null => {
  if (!path) return root
  let node: TreeNode | undefined = root
  for (const seg of path.split('/')) { node = node?.folders.get(seg); if (!node) return null }
  return node
}
const countAll = (n: TreeNode): number => n.flows.length + [...n.folders.values()].reduce((s, c) => s + countAll(c), 0)
const childFoldersOf = (n: TreeNode) => [...n.folders.values()].sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name))

export function FlowExplorer({
  flows, folders = [], search,
  onMove, onMoveFolder, onReorderFolder, onDeleteFolder, onCreateSubfolder, onRenameFolder, renderFlow,
}: Props) {
  const tree = useMemo(() => buildTree(flows, folders), [flows, folders])
  const [cwd, setCwd] = useState('')            // current folder path ("" = root)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)

  const current = nodeByPath(tree, cwd) ?? tree
  // selected folder may have been deleted/renamed → fall back to root
  if (cwd && !nodeByPath(tree, cwd)) { /* render root; effect-free fallback */ }

  const needle = search.trim().toLowerCase()
  const matchFlow = (f: FlowLike) => !needle || f.name.toLowerCase().includes(needle)

  // ── drag-and-drop (same model as FlowTree) ──
  const dragging = useRef<{ kind: 'flow' | 'folder'; id: string } | null>(null)
  const startFlow = (e: React.DragEvent, id: string) => { dragging.current = { kind: 'flow', id }; e.dataTransfer.setData('text/flow-id', id); e.dataTransfer.effectAllowed = 'move' }
  const startFolder = (e: React.DragEvent, path: string) => { dragging.current = { kind: 'folder', id: path }; e.dataTransfer.setData('text/folder-path', path); e.dataTransfer.effectAllowed = 'move' }
  const end = () => { dragging.current = null; setDropTarget(null) }
  const allow = (e: React.DragEvent, key: string) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dropTarget !== key) setDropTarget(key) }

  // Drop onto a folder: flow → move in; folder → nest (reparent) unless self/subtree.
  const dropOnFolder = (e: React.DragEvent, folderPath: string, flowCount: number) => {
    e.preventDefault(); e.stopPropagation()
    const d = dragging.current; dragging.current = null; setDropTarget(null)
    if (!d) return
    if (d.kind === 'flow') onMove(d.id, folderPath, flowCount)
    else if (onMoveFolder && d.id !== folderPath && !folderPath.startsWith(d.id + '/')) onMoveFolder(d.id, folderPath)
  }
  const dropOnFlowGap = (e: React.DragEvent, folderPath: string, order: number) => {
    e.preventDefault(); e.stopPropagation()
    const d = dragging.current; dragging.current = null; setDropTarget(null)
    if (d?.kind === 'flow') onMove(d.id, folderPath, order)
  }

  const isOpen = (p: string) => !collapsed[p]
  const toggle = (p: string) => setCollapsed(c => ({ ...c, [p]: !c[p] }))

  // ── left: folder tree (folders only) ──
  const renderTreeNode = (node: TreeNode, depth: number): React.ReactNode => {
    const subs = childFoldersOf(node)
    const selected = node.path === cwd
    const dropKey = `tree:${node.path}`
    return (
      <div key={node.path || 'root'}>
        <div
          draggable={!!node.path}
          onDragStart={node.path ? (e => { e.stopPropagation(); startFolder(e, node.path) }) : undefined}
          onDragEnd={end}
          onDragOver={e => allow(e, dropKey)}
          onDrop={e => dropOnFolder(e, node.path, node.flows.length)}
          onClick={() => setCwd(node.path)}
          onContextMenu={node.path ? (e => { e.preventDefault(); setMenu({ path: node.path, x: e.clientX, y: e.clientY }) }) : undefined}
          style={{ paddingLeft: 6 + depth * 12 }}
          className={`group/tn flex items-center gap-1.5 pr-2 py-1 rounded-md cursor-pointer select-none text-xs
            ${selected ? 'bg-blue-500/20 text-blue-200' : 'text-gray-300 hover:bg-white/5'}
            ${dropTarget === dropKey ? 'ring-1 ring-blue-400/60 bg-blue-500/10' : ''}`}
        >
          {subs.length > 0 ? (
            <span className="text-[9px] text-gray-500 w-3" onClick={e => { e.stopPropagation(); toggle(node.path) }}>
              {isOpen(node.path) ? '▼' : '▶'}
            </span>
          ) : <span className="w-3" />}
          <span>{node.path === '' ? '🗂' : '📁'}</span>
          <span className="truncate">{node.path === '' ? 'Todos' : node.name}</span>
          <span className="text-[9px] text-gray-500">{countAll(node)}</span>
        </div>
        {isOpen(node.path) && subs.map(s => renderTreeNode(s, depth + 1))}
      </div>
    )
  }

  // ── right: breadcrumb + contents of cwd ──
  const crumbs = cwd ? cwd.split('/') : []
  const visibleSubs = childFoldersOf(current)
  const visibleFlows = current.flows.filter(matchFlow)

  return (
    <div className="flex gap-3 min-h-[300px]">
      {/* LEFT: folder tree */}
      <div
        className="w-56 shrink-0 bg-white/[0.02] border border-white/5 rounded-xl p-2 overflow-y-auto max-h-[70vh]"
        onDragOver={e => allow(e, 'tree:')}
        onDrop={e => dropOnFolder(e, '', tree.flows.length)}
      >
        {renderTreeNode(tree, 0)}
      </div>

      {/* RIGHT: contents */}
      <div className="flex-1 min-w-0">
        {/* breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2 flex-wrap">
          <button onClick={() => setCwd('')} className={`px-1.5 py-0.5 rounded hover:bg-white/5 ${!cwd ? 'text-blue-300' : ''}`}>🗂 Todos</button>
          {crumbs.map((seg, i) => {
            const path = crumbs.slice(0, i + 1).join('/')
            return (
              <span key={path} className="flex items-center gap-1">
                <span className="text-gray-600">›</span>
                <button onClick={() => setCwd(path)} className={`px-1.5 py-0.5 rounded hover:bg-white/5 ${i === crumbs.length - 1 ? 'text-blue-300' : ''}`}>{seg}</button>
              </span>
            )
          })}
        </div>

        <div className="space-y-2">
          {/* subfolders of the current folder (double-click to open) */}
          {visibleSubs.map(s => (
            <div
              key={s.path}
              draggable
              onDragStart={e => { e.stopPropagation(); startFolder(e, s.path) }}
              onDragEnd={end}
              onDragOver={e => allow(e, `c:${s.path}`)}
              onDrop={e => dropOnFolder(e, s.path, s.flows.length)}
              onDoubleClick={() => setCwd(s.path)}
              onContextMenu={e => { e.preventDefault(); setMenu({ path: s.path, x: e.clientX, y: e.clientY }) }}
              className={`flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-xl p-3 cursor-pointer hover:border-white/10
                ${dropTarget === `c:${s.path}` ? 'ring-2 ring-blue-400/50 bg-blue-500/10' : ''}`}
            >
              <span className="text-xl">📁</span>
              <span className="text-sm font-medium text-white flex-1 truncate">{s.name}</span>
              <span className="text-[10px] text-gray-500">{countAll(s)} item(s)</span>
              {onRenameFolder && <button onClick={e => { e.stopPropagation(); onRenameFolder(s.path) }} className="text-[10px] text-gray-500 hover:text-white px-1">✏️</button>}
              {onDeleteFolder && <button onClick={e => { e.stopPropagation(); onDeleteFolder(s.path) }} className="text-[10px] text-gray-500 hover:text-red-400 px-1">🗑</button>}
            </div>
          ))}

          {/* flows in the current folder */}
          {visibleFlows.map((f, i) => (
            <div key={f.id}>
              <div
                onDragOver={e => allow(e, `fg:${cwd}:${i}`)}
                onDrop={e => dropOnFlowGap(e, cwd, orderOf(f))}
                className={`h-2 -my-1 rounded transition-colors ${dropTarget === `fg:${cwd}:${i}` ? 'bg-blue-400/60 h-3' : ''}`}
              />
              <div draggable onDragStart={e => startFlow(e, f.id)} onDragEnd={end} className="cursor-grab active:cursor-grabbing">
                {renderFlow(f)}
              </div>
            </div>
          ))}

          {visibleSubs.length === 0 && visibleFlows.length === 0 && (
            <div className="text-center text-gray-600 text-xs py-10 border border-dashed border-white/5 rounded-xl">
              Pasta vazia{needle ? ' (ou nada bate com a busca)' : ''}.
              {onCreateSubfolder && <> Arraste fluxos para cá ou <button onClick={() => onCreateSubfolder(cwd)} className="text-blue-400 hover:underline">crie uma subpasta</button>.</>}
            </div>
          )}
        </div>
      </div>

      {/* context menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} />
          <div className="fixed z-[81] min-w-[160px] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 text-xs text-gray-200" style={{ left: menu.x, top: menu.y }}>
            <button onClick={() => { onCreateSubfolder?.(menu.path); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-white/10">📁 Nova subpasta</button>
            <button onClick={() => { setCwd(menu.path); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-white/10">📂 Abrir</button>
            {onRenameFolder && <button onClick={() => { onRenameFolder(menu.path); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-white/10">✏️ Renomear</button>}
            {onDeleteFolder && <button onClick={() => { onDeleteFolder(menu.path); setMenu(null) }} className="w-full text-left px-3 py-1.5 hover:bg-red-500/15 text-red-300">🗑 Excluir</button>}
          </div>
        </>
      )}
    </div>
  )
}
