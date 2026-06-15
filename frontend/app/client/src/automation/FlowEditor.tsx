import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  type NodeMouseHandler,
  type ReactFlowInstance,
  type XYPosition,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes, TRIGGER_EVENTS } from './nodes'
import { registryDefaults, registryCatalog, registryMetaByType } from './nodes/registry'
import { NodeDetailPanel, type CaptureTraceEntry } from './components/NodeDetailPanel'
import { nodeIcon } from './nodes/nodeIcons'
import { LuZap, LuGitFork, LuDatabase, LuTarget, LuBot, LuPalette, LuShapes } from 'react-icons/lu'
import type { IconType } from 'react-icons'

// Vector icon per catalog family (replaces the old emoji in the family rail).
const FAMILY_ICON: Record<string, IconType> = {
  triggers: LuZap, logic: LuGitFork, data: LuDatabase,
  actions: LuTarget, ai: LuBot, ui: LuPalette, other: LuShapes,
}

export interface CaptureData {
  active: boolean
  flowId?: string
  trace?: CaptureTraceEntry[]
  context?: Record<string, any>
}

interface FlowEditorProps {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onSave: (nodes: Node[], edges: Edge[], closeAfter?: boolean) => void
  flowName: string
  onNameChange: (name: string) => void
  folderPath?: string
  onFolderChange?: (folder: string) => void
  folderSuggestions?: string[]
  onBack?: () => void
  executionContext?: Record<string, any> | null
  captureData?: CaptureData | null
  onStartCapture?: () => void
  onStopCapture?: () => void
}

let nodeIdCounter = 0
const genId = () => `node_${Date.now()}_${nodeIdCounter++}`

// Single source of truth for a node's accent colour (used by minimap + edges).
function nodeAccent(type?: string): string {
  const regColor = type ? registryMetaByType[type]?.color : undefined
  if (regColor) return regColor
  switch (type) {
    case 'trigger': return '#22c55e'
    case 'condition': return '#eab308'
    case 'http_request': return '#06b6d4'
    case 'set_variable': return '#a855f7'
    case 'script': return '#f97316'
    case 'wait': return '#ec4899'
    case 'delay': return '#a855f7'
    case 'ai_agent': return '#d946ef'
    default: return '#3b82f6'
  }
}

type NodeCatalogItem = {
  type: string
  label: string
  description: string
  category: string
  family?: string   // node.meta.kind — the node declares its own menu family
  subgroup?: string // sub-grouping within the family (e.g. 'Jogador', 'Players')
  icon: string
  accent: string
  data?: Record<string, any>
}

// Canonical menu families, in display order. A node's family is its meta.kind;
// for legacy catalog items (game events, action subtypes) that lack `kind`, we
// fall back to matching the old `category` string.
const CATEGORY_FAMILIES: { id: string; label: string; icon: string; kinds: string[]; legacyCategories: string[] }[] = [
  { id: 'triggers', label: 'Gatilhos', icon: '⚡', kinds: ['trigger'], legacyCategories: ['Eventos do jogo', 'Gatilhos'] },
  { id: 'logic', label: 'Lógica', icon: '🔀', kinds: ['logic'], legacyCategories: ['Logica'] },
  { id: 'data', label: 'Dados', icon: '🗃', kinds: ['data'], legacyCategories: ['Dados'] },
  { id: 'actions', label: 'Ações', icon: '🎯', kinds: ['action'], legacyCategories: ['Acoes', 'Acoes DSTP'] },
  { id: 'ai', label: 'IA', icon: '🤖', kinds: ['ai'], legacyCategories: ['IA'] },
  { id: 'ui', label: 'Interface (UI)', icon: '🎨', kinds: ['ui', 'ui-primitive'], legacyCategories: ['UI', 'UI Primitivos'] },
]

function familyFor(item: NodeCatalogItem): { id: string; label: string; icon: string } {
  const fam = item.family
    ? CATEGORY_FAMILIES.find(f => f.kinds.includes(item.family!))
    : CATEGORY_FAMILIES.find(f => f.legacyCategories.includes(item.category))
  return fam ?? { id: 'other', label: 'Outros', icon: '▢' }
}

const TRIGGER_CATALOG: NodeCatalogItem[] = TRIGGER_EVENTS.map(event => ({
  type: 'trigger',
  label: event.label,
  description: `Evento de ${event.category}`,
  category: 'Eventos do jogo',
  subgroup: event.category,   // players / world / combat / ... → catalog sub-filter
  icon: '⚡',
  accent: 'text-green-400',
  data: { event_type: event.value },
}))

// All node-type palette entries come from the registry (one per module) — every
// action is now its own node with its own `subgroup`, so the old central
// ACTION_NODE_CATALOG (derived from ACTION_TYPES) is gone.
const NODE_CATALOG_MERGED: NodeCatalogItem[] = registryCatalog

export function FlowEditor({ initialNodes = [], initialEdges = [], onSave, flowName, onNameChange, folderPath, onFolderChange, folderSuggestions = [], onBack, executionContext, captureData, onStartCapture, onStopCapture }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)
  const [nodeSearch, setNodeSearch] = useState('')
  // Catalog navigation: a family is selected in the left rail; a subgroup chip
  // filters within it. '' subgroup = show all of the family. Search flattens both.
  const [activeFamily, setActiveFamily] = useState<string>('triggers')
  const [activeSubgroup, setActiveSubgroup] = useState<string>('')
  const [nodeDrawerOpen, setNodeDrawerOpen] = useState(false)
  // Live preview of the node being dragged from the library, following the cursor
  // over the canvas. {type, data} + screen position; null when not dragging.
  const [dragPreview, setDragPreview] = useState<{ item: NodeCatalogItem; x: number; y: number } | null>(null)
  const draggingItemRef = useRef<NodeCatalogItem | null>(null)
  // "Drop to create": when a connection is dragged from a handle and released on
  // empty canvas, we stash the source node/handle + the drop position, open the
  // drawer, and auto-connect the chosen node. Cleared after use or on cancel.
  const pendingConnectRef = useRef<{ source: string; sourceHandle: string | null; position: XYPosition } | null>(null)
  const reactFlowRef = useRef<ReactFlowInstance | null>(null)

  // Undo/Redo history
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([{ nodes: initialNodes, edges: initialEdges }])
  const historyIndexRef = useRef(0)
  const isUndoRedoRef = useRef(false)

  // Snapshot current state to history (debounced to avoid noise from drag operations)
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isUndoRedoRef.current) { isUndoRedoRef.current = false; return }
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
    snapshotTimer.current = setTimeout(() => {
      const h = historyRef.current
      const idx = historyIndexRef.current
      // Trim future states if we made changes after undo
      historyRef.current = h.slice(0, idx + 1)
      historyRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
      if (historyRef.current.length > 50) historyRef.current.shift()
      historyIndexRef.current = historyRef.current.length - 1
    }, 500)
  }, [nodes, edges])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const idx = historyIndexRef.current
        if (idx > 0) {
          historyIndexRef.current = idx - 1
          const state = historyRef.current[idx - 1]
          isUndoRedoRef.current = true
          setNodes(state.nodes)
          setEdges(state.edges)
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        const idx = historyIndexRef.current
        if (idx < historyRef.current.length - 1) {
          historyIndexRef.current = idx + 1
          const state = historyRef.current[idx + 1]
          isUndoRedoRef.current = true
          setNodes(state.nodes)
          setEdges(state.edges)
        }
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') {
        const target = e.target as HTMLElement | null
        const tagName = target?.tagName?.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) return
        e.preventDefault()
        setNodeDrawerOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setNodes, setEdges])

  // Build node statuses from capture trace
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, { status: string; output?: any; error?: string }>>({})

  useEffect(() => {
    if (!captureData) {
      setNodeStatuses({})
      return
    }
    if (captureData.active) {
      setNodeStatuses({})
      return
    }
    if (captureData.trace) {
      const statuses: Record<string, { status: string; output?: any; error?: string }> = {}
      for (const entry of captureData.trace) {
        statuses[entry.nodeId] = {
          status: entry.status,
          output: entry.output,
          error: entry.error,
        }
      }
      setNodeStatuses(statuses)
    }
  }, [captureData])

  const detailNode = useMemo(() => {
    if (!detailNodeId) return null
    return nodes.find(n => n.id === detailNodeId) || null
  }, [nodes, detailNodeId])


  // The full catalog (triggers + every registry node), each tagged with family.
  const allCatalogItems = useMemo<(NodeCatalogItem & { familyId: string })[]>(() => {
    const all = [...TRIGGER_CATALOG, ...NODE_CATALOG_MERGED]
    return all.map(item => ({ ...item, familyId: familyFor(item).id }))
  }, [])

  // Mega-grid model: families (left rail, with counts), the active family's
  // subgroups (chips), and the visible cards. A search query flattens everything
  // (ignores family/subgroup) and shows all matches as one grid.
  const catalogModel = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase()
    const matches = (item: NodeCatalogItem) =>
      !query || `${item.label} ${item.description} ${item.category} ${item.type} ${item.subgroup || ''}`.toLowerCase().includes(query)

    // Families present, in canonical order, with total counts.
    const order = [...CATEGORY_FAMILIES.map(f => f.id), 'other']
    const families = order
      .map(id => {
        const meta = id === 'other' ? { id, label: 'Outros', icon: '▢' } : CATEGORY_FAMILIES.find(f => f.id === id)!
        const count = allCatalogItems.filter(i => i.familyId === id).length
        return { ...meta, count }
      })
      .filter(f => f.count > 0)

    if (query) {
      // Search mode: ignore family/subgroup, show all matches as a flat grid.
      return { families, searchMode: true as const, subgroups: [], items: allCatalogItems.filter(matches) }
    }

    const inFamily = allCatalogItems.filter(i => i.familyId === activeFamily)
    // Subgroups within the active family (preserve first-seen order), with counts.
    const subOrder: string[] = []
    const subCount: Record<string, number> = {}
    for (const i of inFamily) {
      const s = i.subgroup || 'Geral'
      if (!(s in subCount)) { subOrder.push(s); subCount[s] = 0 }
      subCount[s]++
    }
    const subgroups = subOrder.map(s => ({ id: s, count: subCount[s] }))
    const items = activeSubgroup
      ? inFamily.filter(i => (i.subgroup || 'Geral') === activeSubgroup)
      : inFamily
    return { families, searchMode: false as const, subgroups, items }
  }, [nodeSearch, activeFamily, activeSubgroup, allCatalogItems])

  // Reset the subgroup chip whenever the family changes.
  useEffect(() => { setActiveSubgroup('') }, [activeFamily])

  // Inject execution status + capture indicator into node data
  const nodesWithExecution = useMemo(() => {
    const traceNodeIds = new Set((captureData?.trace || []).map(t => t.nodeId))
    const hasStatuses = Object.keys(nodeStatuses).length > 0
    const hasTrace = traceNodeIds.size > 0
    const capturedTrigger = captureData?.context?.trigger

    if (!hasStatuses && !hasTrace && !capturedTrigger) return nodes

    return nodes.map(node => {
      const execStatus = nodeStatuses[node.id]
      const hasCaptureData = traceNodeIds.has(node.id)
      // A trigger only matches the captured event when its event_type actually
      // equals the captured one. A blank trigger (no event_type) must NOT match,
      // otherwise unconfigured triggers get falsely marked as "completed".
      const isMatchingCapturedTrigger = node.type === 'trigger'
        && !!capturedTrigger
        && !!node.data?.event_type
        && capturedTrigger._event_type === node.data.event_type

      if (!execStatus && !hasCaptureData && !isMatchingCapturedTrigger) return node
      return {
        ...node,
        data: {
          ...node.data,
          ...(execStatus ? { _executionStatus: execStatus.status, _executionOutput: execStatus.output, _executionError: execStatus.error } : {}),
          ...(isMatchingCapturedTrigger && !execStatus ? { _executionStatus: 'completed', _executionOutput: capturedTrigger } : {}),
          ...(hasCaptureData || isMatchingCapturedTrigger ? { _hasCaptureData: true } : {}),
        },
      }
    })
  }, [nodes, nodeStatuses, captureData?.trace, captureData?.context])

  // Colour each edge by its SOURCE node's accent — so the eye can trace where a
  // connection comes from (n8n/Zapier do this). A subtle gradient is overkill;
  // a solid type-tinted stroke at ~55% alpha reads clean against the dark canvas.
  const edgesColored = useMemo(() => {
    if (edges.length === 0) return edges
    const colorByNode = new Map(nodes.map(n => [n.id, nodeAccent(n.type)]))
    return edges.map(e => {
      const c = colorByNode.get(e.source) || '#3b82f6'
      return {
        ...e,
        type: e.type || 'smoothstep',
        style: { ...e.style, stroke: e.selected ? c : `${c}99`, strokeWidth: e.selected ? 3 : 2 },
        markerEnd: e.markerEnd,
      }
    })
  }, [edges, nodes])

  // Double-click opens the detail modal
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    setDetailNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    // Pane click deselects nodes (default React Flow behavior) but does not close modal
  }, [])

  // Close the drawer AND cancel any pending drop-to-create connection (user
  // dismissed without picking a node).
  const closeDrawer = useCallback(() => {
    pendingConnectRef.current = null
    setNodeDrawerOpen(false)
  }, [])

  const onConnect = useCallback((params: Connection) => {
    // A real connection landed on a handle — don't trigger drop-to-create.
    pendingConnectRef.current = null
    setEdges(eds => addEdge({
      ...params,
      id: `edge_${Date.now()}`,
      type: 'smoothstep',
      style: { strokeWidth: 2 },
    }, eds))
  }, [setEdges])

  // Drop-to-create: when a connection drag ends on EMPTY canvas (no target node),
  // open the drawer and remember the source handle + drop point so the chosen node
  // gets created there and auto-connected. `connectionState` is React Flow's own
  // end state — more reliable than sniffing the DOM event target.
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: any) => {
    if (connectionState?.toNode) return            // landed on a node → normal connect
    const from = connectionState?.fromNode
    const fromHandle = connectionState?.fromHandle
    // Only outgoing (source) drags spawn a downstream node.
    if (!from?.id || fromHandle?.type !== 'source' || !reactFlowRef.current) return
    const pt = 'changedTouches' in event ? event.changedTouches[0] : (event as MouseEvent)
    const position = reactFlowRef.current.screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
    pendingConnectRef.current = { source: from.id, sourceHandle: fromHandle?.id ?? null, position }
    // Coming from a node's output → a trigger never fits next. Land on Ações.
    setActiveFamily('actions')
    setNodeDrawerOpen(true)
  }, [])

  const createNode = useCallback((type: string, position?: XYPosition, dataOverride?: Record<string, any>): Node => {
    // Initial node.data comes from the node's registry meta.defaults.
    return {
      id: genId(),
      type,
      position: position || { x: 250 + Math.random() * 100, y: 100 + nodes.length * 120 },
      data: { ...(registryDefaults[type] || {}), ...(dataOverride || {}) },
    }
  }, [nodes.length])

  const addCatalogItem = useCallback((item: NodeCatalogItem) => {
    const pending = pendingConnectRef.current
    // Drop-to-create: place the node where the connection was released and wire it.
    const newNode = createNode(item.type, pending?.position, item.data)
    setNodes(nds => [...nds, newNode])
    if (pending) {
      pendingConnectRef.current = null
      setEdges(eds => addEdge({
        source: pending.source,
        sourceHandle: pending.sourceHandle,
        target: newNode.id,
        targetHandle: null,
        id: `edge_${Date.now()}`,
        type: 'smoothstep',
        style: { strokeWidth: 2 },
      }, eds))
    }
    setNodeDrawerOpen(false)
  }, [createNode, setNodes, setEdges])

  const addCatalogItemAt = useCallback((item: NodeCatalogItem, position: XYPosition) => {
    const newNode = createNode(item.type, position, item.data)
    setNodes(nds => [...nds, newNode])
    setNodeDrawerOpen(false)
  }, [createNode, setNodes])

  const onNodeDragStart = useCallback((event: React.DragEvent, item: NodeCatalogItem) => {
    event.dataTransfer.setData('application/dstp-node-item', JSON.stringify({ type: item.type, data: item.data || {} }))
    event.dataTransfer.effectAllowed = 'move'
    draggingItemRef.current = item
    // Hide the native drag image (a blurry clone) — we render our own ghost.
    const empty = document.createElement('div')
    event.dataTransfer.setDragImage(empty, 0, 0)
  }, [])

  const onNodeDragEnd = useCallback(() => {
    draggingItemRef.current = null
    setDragPreview(null)
  }, [])

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    // Follow the cursor with the node ghost.
    const item = draggingItemRef.current
    if (item) setDragPreview({ item, x: event.clientX, y: event.clientY })
  }, [])

  const onCanvasDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/dstp-node-item')
    if (!raw || !reactFlowRef.current) return

    const position = reactFlowRef.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    try {
      const item = JSON.parse(raw) as NodeCatalogItem
      addCatalogItemAt(item, position)
      // Re-open the library after a drop so you can keep dropping nodes in a row.
      setNodeDrawerOpen(true)
    } catch {
      return
    } finally {
      draggingItemRef.current = null
      setDragPreview(null)
    }
  }, [addCatalogItemAt])

  // Update a ui_builder node's tree from the detail-panel editor. Passed down
  // because the modal renders outside <ReactFlow>, so it can't use useReactFlow.
  const updateNodeTree = useCallback((nodeId: string, tree: any) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, tree } } : n))
  }, [setNodes])

  const updateNodeDataFromModal = useCallback((nodeId: string, data: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data } : n))
  }, [setNodes])

  const handleSave = () => onSave(nodes, edges, true)

  // Auto-save: debounce 500ms to let editors (Monaco) commit their changes
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saved'>('idle')
  const initializedRef = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!initializedRef.current) { initializedRef.current = true; return }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      onSave(nodes, edges)
      setAutoSaveStatus('saved')
    }, 500)

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000)

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
  }, [nodes, edges, flowName])

  return (
    <div className="relative h-full overflow-hidden bg-[#0a0a0a] text-white">
      {/* Top bar */}
      <header className="absolute left-0 right-0 top-0 z-20 h-[68px] bg-[#0a0a0a] border-b border-white/5 flex items-center px-6">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <>
              <button onClick={onBack} className="text-xs text-gray-300 hover:text-white transition-colors">← Voltar</button>
              <span className="text-gray-500">/</span>
            </>
          )}
          <span className="text-gray-300 text-xs">DSTP</span>
          <span className="text-gray-500">/</span>
          <input
            className="bg-transparent text-sm font-semibold text-white w-[260px] focus:outline-none border-b border-transparent focus:border-white/20"
            placeholder="Nome do fluxo..."
            value={flowName}
            onChange={e => onNameChange(e.target.value)}
          />
          {onFolderChange && (
            <>
              <span className="text-gray-500">/</span>
              <span className="text-xs">📁</span>
              <input
                list="dstp-folder-list"
                className="bg-transparent text-xs text-gray-300 w-[160px] focus:outline-none border-b border-transparent focus:border-white/20 placeholder:text-gray-600"
                placeholder="pasta (ex: Loja/Eventos)"
                value={folderPath ?? ''}
                onChange={e => onFolderChange(e.target.value)}
              />
              <datalist id="dstp-folder-list">
                {folderSuggestions.map(f => <option key={f} value={f} />)}
              </datalist>
            </>
          )}
          <span className="text-[11px] text-gray-500">automação do servidor</span>
        </div>

        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-2 text-[11px] text-gray-500 mr-1">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-600" />{nodes.length} nodes</span>
            <span className="text-gray-700">·</span>
            <span>{edges.length} conexões</span>
          </span>
          {/* Auto-save status pill */}
          <span className={`flex items-center gap-1.5 text-[11px] transition-colors ${autoSaveStatus === 'saved' ? 'text-green-400' : 'text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${autoSaveStatus === 'saved' ? 'bg-green-400' : 'bg-gray-600'}`} />
            {autoSaveStatus === 'saved' ? 'Salvo' : 'Salvando…'}
          </span>
          <button onClick={() => setNodeDrawerOpen(true)} className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10 hover:text-white font-medium transition-colors">
            <span className="text-sm leading-none">+</span> Adicionar etapa
          </button>
          <button onClick={handleSave} className="text-xs px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/20 hover:bg-blue-400 transition-colors">Salvar</button>
        </div>
      </header>

      {/* Canvas */}
      <main className="absolute left-0 right-0 top-[68px] bottom-9" onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
        <ReactFlow
          nodes={nodesWithExecution}
          edges={edgesColored}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          // Drop handlers on ReactFlow itself — it fills the <main> and consumes
          // drag events, so the wrapper's onDragOver/onDrop never fire. Must be here.
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
          onInit={instance => { reactFlowRef.current = instance }}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={detailNode ? null : ['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'smoothstep', style: { strokeWidth: 2 } }}
          connectionLineType={'smoothstep' as any}
          proOptions={{ hideAttribution: true }}
          style={{ background: '#0a0b0d' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#20242c" />
          <Controls
            showInteractive={false}
            position="bottom-left"
            className="!bg-[#111] !border-white/10 !rounded-lg !shadow-none [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-gray-400 [&>button:hover]:!bg-white/5"
          />
          <MiniMap
            nodeColor={n => nodeAccent(n.type)}
            nodeStrokeWidth={0}
            nodeBorderRadius={4}
            className="!bg-[#0f1115] !border !border-white/10 !rounded-xl overflow-hidden"
            maskColor="#0a0b0db0"
          />
        </ReactFlow>

        <button
          onClick={() => setNodeDrawerOpen(true)}
          className="absolute right-4 top-4 grid place-items-center w-11 h-11 rounded-xl bg-blue-500 text-white text-2xl shadow-lg shadow-blue-500/30 hover:bg-blue-400 hover:scale-105 active:scale-95 transition-all"
          title="Adicionar node (N)"
        >
          +
        </button>

        {nodes.length === 0 && (
          <button
            onClick={() => setNodeDrawerOpen(true)}
            className="absolute left-1/2 -translate-x-1/2 bottom-8 rounded-lg px-5 py-3 text-sm font-semibold shadow-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
          >
            Adicionar primeiro evento
          </button>
        )}

        {/* n8n-style "Test workflow" pill — big, centered at the bottom of the canvas */}
        {nodes.length > 0 && (
          <button
            onClick={captureData?.active ? onStopCapture : onStartCapture}
            className={`absolute left-1/2 -translate-x-1/2 bottom-6 flex items-center gap-2 rounded-full pl-4 pr-5 py-2.5 text-sm font-semibold shadow-xl transition-all hover:scale-[1.03] active:scale-95 ${
              captureData?.active
                ? 'bg-red-500 text-white shadow-red-500/30 hover:bg-red-400'
                : 'bg-orange-500 text-white shadow-orange-500/30 hover:bg-orange-400'
            }`}
            title={captureData?.active ? 'Parar a captura de execução' : 'Capturar a próxima execução do fluxo'}
          >
            {captureData?.active ? (
              <>
                <span className="grid place-items-center w-5 h-5 rounded-full bg-white/20">
                  <span className="w-2 h-2 rounded-sm bg-white" />
                </span>
                Parar teste
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </>
            ) : (
              <>
                <span className="grid place-items-center w-5 h-5 rounded-full bg-white/20">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white"><path d="M8 5v14l11-7z" /></svg>
                </span>
                Testar fluxo
              </>
            )}
          </button>
        )}
      </main>

      {/* Bottom logs bar */}
      <footer className="absolute left-0 right-0 bottom-0 z-20 h-9 bg-[#0a0a0a] border-t border-white/5 flex items-center px-4">
        <button className="text-xs font-semibold text-white">Eventos e logs</button>
        <span className="ml-3 text-[10px] text-gray-500">{edges.length} conexoes · {nodes.length} nodes</span>
      </footer>

      {/* Node drawer */}
      {nodeDrawerOpen && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          {/* Backdrop: closes on click, but must let a node DROP pass through to
              the canvas underneath (delegate to the same drop handlers) — else the
              drop lands here and is blocked. */}
          <div
            role="button"
            tabIndex={0}
            className="absolute inset-0 bg-black/10 pointer-events-auto"
            onClick={closeDrawer}
            onKeyDown={e => { if (e.key === 'Escape') closeDrawer() }}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasDrop}
            aria-label="Fechar biblioteca de nodes"
          />
          <aside className="absolute right-0 top-[68px] bottom-9 w-[480px] bg-[#0d0e11] border-l border-white/10 shadow-2xl pointer-events-auto flex flex-col">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-white/5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="dstp-node-title text-base font-bold text-white">Adicionar etapa</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Arraste para o canvas ou clique para inserir.</p>
                </div>
                <button onClick={closeDrawer} className="grid place-items-center w-7 h-7 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 text-lg transition-colors">×</button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">⌕</span>
                <input
                  value={nodeSearch}
                  onChange={e => setNodeSearch(e.target.value)}
                  placeholder="Buscar em todos os nós..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-blue-500/40 focus:outline-none placeholder:text-gray-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Body: family rail + grid */}
            <div className="flex-1 flex min-h-0">
              {/* Left rail — families (hidden while searching) */}
              {!catalogModel.searchMode && (
                <nav className="w-[148px] shrink-0 border-r border-white/5 overflow-y-auto py-2 bg-black/20">
                  {catalogModel.families.map(fam => {
                    const active = fam.id === activeFamily
                    const FamIcon = FAMILY_ICON[fam.id] || LuShapes
                    return (
                      <button
                        key={fam.id}
                        onClick={() => setActiveFamily(fam.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-l-2 ${active ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'}`}
                      >
                        <FamIcon size={15} strokeWidth={2.2} className="shrink-0" />
                        <span className="text-[12px] font-medium flex-1 truncate">{fam.label}</span>
                        <span className={`text-[9px] font-mono rounded px-1 py-0.5 ${active ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-gray-600'}`}>{fam.count}</span>
                      </button>
                    )
                  })}
                </nav>
              )}

              {/* Right — subgroup chips + card grid */}
              <div className="flex-1 flex flex-col min-w-0">
                {!catalogModel.searchMode && catalogModel.subgroups.length > 1 && (
                  <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/5">
                    <button
                      onClick={() => setActiveSubgroup('')}
                      className={`text-[11px] px-2 py-1 rounded-md font-medium transition-colors ${activeSubgroup === '' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >Todos</button>
                    {catalogModel.subgroups.map(sg => (
                      <button
                        key={sg.id}
                        onClick={() => setActiveSubgroup(sg.id)}
                        className={`text-[11px] px-2 py-1 rounded-md font-medium transition-colors ${activeSubgroup === sg.id ? 'bg-blue-500/20 text-blue-300' : 'text-gray-500 hover:text-gray-300'}`}
                      >{sg.id} <span className="opacity-50">{sg.count}</span></button>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-2">
                  {catalogModel.items.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-10">Nenhum nó encontrado.</div>
                  )}
                  <div className="space-y-1">
                    {catalogModel.items.map(item => {
                      const ItemIcon = nodeIcon(item.type, `${item.icon || ''} ${item.label || ''} ${item.data?.action_type || ''} ${item.data?.event_type || ''}`)
                      const accent = nodeAccent(item.type)
                      // Strip a leading emoji from trigger labels for a clean card title.
                      const cleanLabel = item.label.replace(/^[^\w(]+\s*/u, '') || item.label
                      return (
                        // A real <div> (not <button>) — `draggable` on a button is
                        // unreliable across browsers (Firefox ignores it).
                        <div
                          key={`${item.type}:${item.data?.event_type || item.label}`}
                          role="button"
                          tabIndex={0}
                          draggable
                          onDragStart={event => onNodeDragStart(event, item)}
                          onDragEnd={onNodeDragEnd}
                          onClick={() => addCatalogItem(item)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addCatalogItem(item) } }}
                          className="group/card flex items-start gap-2.5 px-2.5 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15 transition-colors cursor-grab active:cursor-grabbing"
                        >
                          <span
                            className="grid place-items-center w-8 h-8 rounded-md shrink-0 mt-0.5"
                            style={{ background: `${accent}1a`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}30` }}
                          >
                            <ItemIcon size={16} strokeWidth={2.2} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold text-gray-100 group-hover/card:text-white leading-tight truncate">{cleanLabel}</div>
                            <div className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{item.description}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Node Detail Modal (overlay) */}
      {detailNode && (
        <NodeDetailPanel
          node={detailNode}
          onClose={() => setDetailNodeId(null)}
          onUpdateData={updateNodeDataFromModal}
          onUpdateTree={updateNodeTree}
          captureTrace={captureData?.trace || null}
          captureContext={captureData?.context || executionContext || null}
          allNodes={nodes}
          allEdges={edges.map(e => ({ source: e.source, target: e.target }))}
        />
      )}

      {/* Drag ghost — follows the cursor while dragging a node from the library
          onto the canvas. A light card (icon + label) so we don't run the node's
          ReactFlow hooks outside the provider. */}
      {dragPreview && (() => {
        const color = nodeAccent(dragPreview.item.type)
        const GhostIcon = nodeIcon(dragPreview.item.type, `${dragPreview.item.icon || ''} ${dragPreview.item.label || ''} ${dragPreview.item.data?.action_type || ''}`)
        return (
          <div
            className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 opacity-90 rotate-1"
            style={{ left: dragPreview.x, top: dragPreview.y }}
          >
            <div
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 min-w-[170px] text-xs shadow-2xl"
              style={{ background: '#16181d', border: `1px solid ${color}66`, boxShadow: `0 0 28px ${color}55, 0 8px 20px rgba(0,0,0,0.6)` }}
            >
              <span className="grid place-items-center w-7 h-7 rounded-lg shrink-0" style={{ background: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}33` }}>
                <GhostIcon size={15} strokeWidth={2.2} />
              </span>
              <span className="dstp-node-title font-semibold text-[12px] text-white">{dragPreview.item.label}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
