import { useMemo, useState, useCallback, useRef } from 'react'

// Renders the flow list as a collapsible folder tree with HTML5 drag-and-drop.
// Folders are DERIVED from each flow's folderPath ("" = root, "Loja/Eventos" =
// nested) — there is no folders table. Dragging a flow onto a folder header moves
// it there; dropping on a gap between flows reorders within the folder. Both call
// onMove(flowId, folderPath, sortOrder), which the page wires to auto.moveFlow.
//
// The actual flow card markup is supplied by the parent via renderFlow(flow), so
// this component owns only the tree + DnD, not the card's buttons.

export type FlowLike = { id: string; name: string; folderPath?: string; folder_path?: string; sortOrder?: number; sort_order?: number }

export type FolderLike = { path: string; sortOrder?: number; sort_order?: number }

export type TreeNode = {
  name: string          // folder segment ("" for the synthetic root)
  path: string          // full folder path to here
  order: number         // sortOrder among siblings
  folders: Map<string, TreeNode>
  flows: FlowLike[]
}

export const folderOf = (f: FlowLike) => (f.folderPath ?? f.folder_path ?? '') as string
export const orderOf = (f: FlowLike) => (f.sortOrder ?? f.sort_order ?? 0) as number

// Ensure a folder path (and ancestors) exists in the tree, returning the leaf node.
function ensurePath(root: TreeNode, path: string): TreeNode {
  let node = root
  for (const seg of path.split('/').map(s => s.trim()).filter(Boolean)) {
    const childPath = node.path ? `${node.path}/${seg}` : seg
    if (!node.folders.has(seg)) node.folders.set(seg, { name: seg, path: childPath, order: 0, folders: new Map(), flows: [] })
    node = node.folders.get(seg)!
  }
  return node
}

export function buildTree(flows: FlowLike[], registeredFolders: FolderLike[]): TreeNode {
  const root: TreeNode = { name: '', path: '', order: 0, folders: new Map(), flows: [] }
  // Registered (possibly empty) folders first, so they show even with no flows.
  for (const rf of registeredFolders) {
    const p = rf.path.trim()
    if (p) ensurePath(root, p).order = (rf.sortOrder ?? rf.sort_order ?? 0)
  }
  for (const f of flows) {
    const path = folderOf(f).trim()
    const node = path ? ensurePath(root, path) : root
    node.flows.push(f)
  }
  // order flows within each folder by sortOrder
  const sortRec = (n: TreeNode) => { n.flows.sort((a, b) => orderOf(a) - orderOf(b)); n.folders.forEach(sortRec) }
  sortRec(root)
  return root
}

export function FlowTree({
  flows, folders = [], search, onMove, onMoveFolder, onReorderFolder,
  onDeleteFolder, onCreateSubfolder, onRenameFolder, renderFlow,
}: {
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
}) {
  const tree = useMemo(() => buildTree(flows, folders), [flows, folders])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Right-click context menu: { path, x, y } or null.
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)

  const toggle = (path: string) => setCollapsed(c => ({ ...c, [path]: !c[path] }))

  const needle = search.trim().toLowerCase()
  const matches = useCallback((f: FlowLike) => !needle || f.name.toLowerCase().includes(needle), [needle])

  // What's being dragged: a flow or a folder. Held in a ref (not just
  // dataTransfer): some browsers block getData() during dragover, and we want the
  // highlight to follow reliably.
  const dragging = useRef<{ kind: 'flow' | 'folder'; id: string } | null>(null)

  const onDragStartFlow = (e: React.DragEvent, id: string) => {
    dragging.current = { kind: 'flow', id }
    e.dataTransfer.setData('text/flow-id', id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragStartFolder = (e: React.DragEvent, path: string) => {
    dragging.current = { kind: 'folder', id: path }
    e.dataTransfer.setData('text/folder-path', path)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragEnd = () => { dragging.current = null; setDropTarget(null) }

  // Drop onto a folder. A flow → move into it; a folder → make it a subfolder
  // (reparent), unless dropping into itself/its own subtree.
  const onDropFolder = (e: React.DragEvent, folderPath: string, count: number) => {
    e.preventDefault(); e.stopPropagation()
    const d = dragging.current
    dragging.current = null
    setDropTarget(null)
    if (!d) return
    if (d.kind === 'flow') onMove(d.id, folderPath, count)
    else if (d.kind === 'folder' && onMoveFolder && d.id !== folderPath && !folderPath.startsWith(d.id + '/')) {
      onMoveFolder(d.id, folderPath)
    }
  }
  // Drop on a gap before a sibling → reorder. A flow takes that sibling's order
  // slot in the same folder; a folder is reordered among its siblings.
  const onDropGap = (e: React.DragEvent, folderPath: string, order: number) => {
    e.preventDefault(); e.stopPropagation()
    const d = dragging.current
    dragging.current = null
    setDropTarget(null)
    if (d?.kind === 'flow') onMove(d.id, folderPath, order)
  }
  const onDropFolderGap = (e: React.DragEvent, parent: string, order: number) => {
    e.preventDefault(); e.stopPropagation()
    const d = dragging.current
    dragging.current = null
    setDropTarget(null)
    if (d?.kind !== 'folder') return
    const draggedParent = d.id.includes('/') ? d.id.slice(0, d.id.lastIndexOf('/')) : ''
    // Same parent → just reorder; different parent → reparent into `parent`.
    if (draggedParent === parent) onReorderFolder?.(d.id, order)
    else if (onMoveFolder && d.id !== parent && !parent.startsWith(d.id + '/')) onMoveFolder(d.id, parent)
  }
  // dragover MUST preventDefault for drop to fire. We only set the highlight here;
  // we deliberately do NOT clear it on dragLeave (leaving onto a child element
  // would flicker/lose the target). It clears on drop or dragend instead.
  const allow = (e: React.DragEvent, key: string) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dropTarget !== key) setDropTarget(key) }

  const renderFolder = (node: TreeNode, depth: number): React.ReactNode => {
    const isRoot = node.path === ''
    const isCollapsed = !isRoot && collapsed[node.path]
    const visibleFlows = node.flows.filter(matches)
    // count of all descendant flows (for the header badge)
    const countAll = (n: TreeNode): number => n.flows.length + [...n.folders.values()].reduce((s, c) => s + countAll(c), 0)

    const headerKey = `folder:${node.path}`
    // Subfolders ordered by sortOrder (drag to reorder), name as tie-break.
    const childFolders = [...node.folders.values()].sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name))
    const body = (
      <>
        {childFolders.map((child, i) => (
          <div key={child.path}>
            {/* drop gap before this folder (reorder folders / reparent into here) */}
            <div
              onDragOver={e => allow(e, `fgap:${node.path}:${i}`)}
              onDrop={e => onDropFolderGap(e, node.path, child.order)}
              className={`h-2 -my-1 rounded transition-colors ${dropTarget === `fgap:${node.path}:${i}` ? 'bg-violet-400/60 h-3' : ''}`}
            />
            {renderFolder(child, depth + 1)}
          </div>
        ))}
        {visibleFlows.map((f, i) => (
          <div key={f.id}>
            {/* drop gap before this flow — taller hit area so it's easy to target */}
            <div
              onDragOver={e => allow(e, `gap:${node.path}:${i}`)}
              onDrop={e => onDropGap(e, node.path, orderOf(f))}
              className={`h-2 -my-1 rounded transition-colors ${dropTarget === `gap:${node.path}:${i}` ? 'bg-blue-400/60 h-3' : ''}`}
            />
            <div
              draggable
              onDragStart={e => onDragStartFlow(e, f.id)}
              onDragEnd={onDragEnd}
              className="cursor-grab active:cursor-grabbing"
            >
              {renderFlow(f)}
            </div>
          </div>
        ))}
      </>
    )

    if (isRoot) {
      return (
        <div
          key="root"
          onDragOver={e => allow(e, headerKey)}
          onDrop={e => onDropFolder(e, '', node.flows.length)}
          className={`space-y-2 rounded-lg p-1 ${dropTarget === headerKey ? 'ring-1 ring-blue-400/40' : ''}`}
        >
          {body}
        </div>
      )
    }

    // The WHOLE folder (header + body) is one drop zone, so dropping anywhere in it
    // moves the flow into the folder. The gap strips inside stopPropagation on drop,
    // so reordering within a folder still takes precedence over the folder-move.
    return (
      <div
        key={node.path}
        style={{ marginLeft: depth > 1 ? 12 : 0 }}
        onDragOver={e => allow(e, headerKey)}
        onDrop={e => onDropFolder(e, node.path, node.flows.length)}
        className={`rounded-lg ${dropTarget === headerKey ? 'bg-blue-500/10 ring-2 ring-blue-400/50' : ''}`}
      >
        <div
          draggable
          onDragStart={e => { e.stopPropagation(); onDragStartFolder(e, node.path) }}
          onDragEnd={onDragEnd}
          onClick={() => toggle(node.path)}
          onContextMenu={e => { e.preventDefault(); setMenu({ path: node.path, x: e.clientX, y: e.clientY }) }}
          className="group/folder flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none text-gray-300 hover:bg-white/5"
        >
          <span className="text-gray-600 text-[10px]" title="Arraste a pasta para mover/reordenar">⠿</span>
          <span className="text-[10px] text-gray-500 w-3">{isCollapsed ? '▶' : '▼'}</span>
          <span className="text-sm">📁</span>
          <span className="text-sm font-medium">{node.name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{countAll(node)}</span>
          <div className="flex-1" />
          {onDeleteFolder && (
            <button
              onClick={e => { e.stopPropagation(); onDeleteFolder(node.path) }}
              title="Excluir pasta (precisa estar vazia)"
              className="text-[10px] text-gray-600 hover:text-red-400 px-1.5 opacity-0 group-hover/folder:opacity-100 transition-opacity"
            >🗑</button>
          )}
        </div>
        {!isCollapsed && <div className="ml-3 mt-1 space-y-2 border-l border-white/5 pl-2">{body}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {renderFolder(tree, 0)}
      {menu && (
        <>
          {/* click-away catcher */}
          <div className="fixed inset-0 z-[80]" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} />
          <div
            className="fixed z-[81] min-w-[160px] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 text-xs text-gray-200"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              onClick={() => { onCreateSubfolder?.(menu.path); setMenu(null) }}
              className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2"
            >📁 Nova subpasta</button>
            {onRenameFolder && (
              <button
                onClick={() => { onRenameFolder(menu.path); setMenu(null) }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2"
              >✏️ Renomear</button>
            )}
            {onDeleteFolder && (
              <button
                onClick={() => { onDeleteFolder(menu.path); setMenu(null) }}
                className="w-full text-left px-3 py-1.5 hover:bg-red-500/15 text-red-300 flex items-center gap-2"
              >🗑 Excluir</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
