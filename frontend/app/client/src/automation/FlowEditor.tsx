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
import { ACTION_TYPES } from './nodes/actions/actionTypes'
import { registryDefaults, registryCatalog, registryTypes, registryMetaByType } from './nodes/registry'
import { NodeDetailPanel, type CaptureTraceEntry } from './components/NodeDetailPanel'

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
  onBack?: () => void
  executionContext?: Record<string, any> | null
  captureData?: CaptureData | null
  onStartCapture?: () => void
  onStopCapture?: () => void
}

let nodeIdCounter = 0
const genId = () => `node_${Date.now()}_${nodeIdCounter++}`

type NodeCatalogItem = {
  type: string
  label: string
  description: string
  category: string
  icon: string
  accent: string
  data?: Record<string, any>
}

const TRIGGER_CATALOG: NodeCatalogItem[] = TRIGGER_EVENTS.map(event => ({
  type: 'trigger',
  label: event.label,
  description: `Evento de ${event.category}`,
  category: 'Eventos do jogo',
  icon: '⚡',
  accent: 'text-green-400',
  data: { event_type: event.value },
}))

const ACTION_NODE_CATALOG: NodeCatalogItem[] = ACTION_TYPES.map(action => ({
  type: 'action',
  label: action.label,
  description: action.params.length > 0
    ? `${action.params.length} parametro(s)`
    : 'Sem parametros',
  category: 'Acoes DSTP',
  icon: '◎',
  accent: 'text-blue-400',
  data: {
    action_type: action.value,
    params: Object.fromEntries(action.params.map(param => [param.key, param.placeholder || ''])),
  },
}))

const NODE_CATALOG: NodeCatalogItem[] = [
  { type: 'webhook', label: 'Webhook', description: 'Dispara o fluxo por uma request HTTP externa.', category: 'Gatilhos', icon: '🪝', accent: 'text-green-400', data: { params: { method: 'ANY', token: '' } } },
  { type: 'condition', label: 'Condition', description: 'Divide o fluxo em verdadeiro/falso.', category: 'Logica', icon: '?', accent: 'text-yellow-400' },
  { type: 'wait', label: 'Wait / Merge', description: 'Espera outros eventos ou junta caminhos.', category: 'Logica', icon: '↔', accent: 'text-pink-400' },
  { type: 'delay', label: 'Delay', description: 'Pausa a execucao por um tempo.', category: 'Logica', icon: '⏱', accent: 'text-gray-400' },
  { type: 'http_request', label: 'HTTP', description: 'Chama uma API externa.', category: 'Acoes', icon: '🌐', accent: 'text-cyan-400' },
  { type: 'script', label: 'Script', description: 'Executa codigo customizado.', category: 'Acoes', icon: '{}', accent: 'text-orange-400' },
  { type: 'ai_agent', label: 'AI Agent', description: 'IA que usa nos conectados como ferramentas (porta tools).', category: 'IA', icon: '🤖', accent: 'text-fuchsia-400' },
  { type: 'ai_memory', label: 'AI Memory', description: 'Memoria key-value que a IA usa como ferramenta (save/get/list/delete).', category: 'IA', icon: '🧠', accent: 'text-fuchsia-400' },
  { type: 'get_player', label: 'Get Player', description: 'Busca dados de um jogador por userid.', category: 'Dados', icon: '👤', accent: 'text-teal-400' },
  { type: 'find_player', label: 'Find Player', description: 'Localiza jogador por nome.', category: 'Dados', icon: '⌕', accent: 'text-teal-400' },
  { type: 'set_variable', label: 'Variable', description: 'Grava valor no contexto do fluxo.', category: 'Dados', icon: 'x=', accent: 'text-purple-400' },
  { type: 'memory', label: 'Memory', description: 'Le ou escreve memoria persistente.', category: 'Dados', icon: '▣', accent: 'text-amber-400' },
  { type: 'ui_menu', label: 'Menu', description: 'Abre menu interativo para jogador.', category: 'UI', icon: '▤', accent: 'text-indigo-300' },
  { type: 'ui_rule', label: 'HUD Rule', description: 'Instala regra dinamica de HUD.', category: 'UI', icon: '▥', accent: 'text-indigo-300' },
  { type: 'ui_builder', label: 'UI Builder', description: 'Monta uma UI por arvore visual.', category: 'UI', icon: '✦', accent: 'text-violet-300' },
  { type: 'ui_panel', label: 'Panel', description: 'Container visual de UI.', category: 'UI Primitivos', icon: '▢', accent: 'text-violet-300' },
  { type: 'ui_col', label: 'Column', description: 'Agrupa filhos na vertical.', category: 'UI Primitivos', icon: '↕', accent: 'text-violet-300' },
  { type: 'ui_row', label: 'Row', description: 'Agrupa filhos na horizontal.', category: 'UI Primitivos', icon: '↔', accent: 'text-violet-300' },
  { type: 'ui_tabs', label: 'Tabs', description: 'Cria abas de UI.', category: 'UI Primitivos', icon: '▦', accent: 'text-violet-300' },
  { type: 'ui_text', label: 'Text', description: 'Texto dinamico.', category: 'UI Primitivos', icon: 'T', accent: 'text-violet-300' },
  { type: 'ui_icon', label: 'Icon', description: 'Icone por prefab.', category: 'UI Primitivos', icon: '◈', accent: 'text-violet-300' },
  { type: 'ui_button', label: 'Button', description: 'Botao com callback.', category: 'UI Primitivos', icon: '●', accent: 'text-violet-300' },
  { type: 'ui_bar', label: 'Bar', description: 'Barra de progresso.', category: 'UI Primitivos', icon: '▰', accent: 'text-violet-300' },
  { type: 'ui_spacer', label: 'Spacer', description: 'Espacamento fixo.', category: 'UI Primitivos', icon: '␣', accent: 'text-violet-300' },
]

// Migrated nodes' palette entries come from the registry; drop their legacy
// hardcoded entries so each node appears once.
const NODE_CATALOG_MERGED: NodeCatalogItem[] = [
  ...NODE_CATALOG.filter(item => !registryTypes.has(item.type)),
  ...registryCatalog,
]

export function FlowEditor({ initialNodes = [], initialEdges = [], onSave, flowName, onNameChange, onBack, executionContext, captureData, onStartCapture, onStopCapture }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)
  const [nodeSearch, setNodeSearch] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'events' | 'nodes'>('all')
  const [nodeDrawerOpen, setNodeDrawerOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
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

  const selectedNode = useMemo(() => nodes.find(n => n.selected) || null, [nodes])

  // Open the inspector when the SELECTION changes (by id), not on every nodes
  // mutation — depending on the node object reopened it on any drag/edit and
  // made it impossible to close while a node stayed selected.
  const selectedNodeId = selectedNode?.id ?? null
  useEffect(() => {
    if (selectedNodeId) setInspectorOpen(true)
  }, [selectedNodeId])

  const catalogGroups = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase()
    const contextItems = catalogFilter === 'events'
      ? TRIGGER_CATALOG
      : catalogFilter === 'nodes'
        ? [...ACTION_NODE_CATALOG, ...NODE_CATALOG_MERGED]
        : [...TRIGGER_CATALOG, ...ACTION_NODE_CATALOG, ...NODE_CATALOG_MERGED]
    const visible = contextItems.filter(item => {
      if (!query) return true
      return `${item.label} ${item.description} ${item.category} ${item.type}`.toLowerCase().includes(query)
    })
    return visible.reduce<Record<string, NodeCatalogItem[]>>((acc, item) => {
      ;(acc[item.category] ||= []).push(item)
      return acc
    }, {})
  }, [nodeSearch, catalogFilter])

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

  // Double-click opens the detail modal
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    setDetailNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    // Pane click deselects nodes (default React Flow behavior) but does not close modal
  }, [])

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({
      ...params,
      id: `edge_${Date.now()}`,
      style: { stroke: '#555', strokeWidth: 2 },
      animated: true,
    }, eds))
  }, [setEdges])

  const createNode = useCallback((type: string, position?: XYPosition, dataOverride?: Record<string, any>): Node => {
    const defaults: Record<string, any> = {
      trigger: {},
      condition: {},
      action: { action_type: '', params: {} },
      delay: { delay_ms: '3000' },
      get_player: { params: { userid: '' } },
      find_player: { params: { name: '' } },
      http_request: { action_type: 'http_request', params: { url: '', method: 'GET', headers: '', body: '' } },
      set_variable: { action_type: 'set_variable', params: {} },
      script: { action_type: 'script', params: { code: 'async function run(context) {\n  // context.trigger tem os dados do evento\n  // Retorne um objeto com os resultados\n  return {\n    result: \"ok\"\n  }\n}' } },
      wait: { mode: 'all', correlation: 'broadcast', timeoutMs: '300000', timeoutAction: 'discard' },
      memory: { action: 'read', params: { key: '' } },
      ui_menu: { action_type: 'ui_menu', buttons: [], params: { userid: '{{trigger.userid}}', id: 'menu', title: '', body: '', buttons: '[]' } },
      ui_rule: { action_type: 'rule_install', preset: 'vital', vital: 'health', anchor: 'bottom', x: 0, y: 80, params: { userid: '{{trigger.userid}}', rules: JSON.stringify([{ id: 'health_bar', when: { event: 'healthdelta' }, do: [{ action: 'update_widget', id: 'health_bar_w', type: 'progress_bar', value: '{{player.health_current}}', max: '{{player.health_max}}', label: 'HP', color: [0.2, 0.9, 0.2, 1], anchor: 'bottom', x: 0, y: 80, width: 220, height: 16 }] }]) } },
      ui_builder: { params: { userid: '{{trigger.userid}}', id: 'ui' }, tree: { type: 'panel', title: 'Painel', children: [] } },
      ui_panel: { params: { userid: '{{trigger.userid}}', id: 'ui', title: '', gap: '8', anchor: 'center' } },
      ui_col: { params: { gap: '8' } },
      ui_row: { params: { gap: '8' } },
      ui_tabs: { params: { active: '0' } },
      ui_text: { params: { text: 'Texto', size: '18' } },
      ui_icon: { params: { prefab: 'log', size: '56' } },
      ui_button: { params: { text: 'Comprar', callback: 'click' } },
      ui_bar: { params: { value: '1', max: '1' } },
      ui_spacer: { params: { height: '8' } },
      // Migrated nodes' defaults come from the registry and override these.
      ...registryDefaults,
    }
    return {
      id: genId(),
      type,
      position: position || { x: 250 + Math.random() * 100, y: 100 + nodes.length * 120 },
      data: { ...(defaults[type] || {}), ...(dataOverride || {}) },
    }
  }, [nodes.length])

  const addCatalogItem = useCallback((item: NodeCatalogItem) => {
    const newNode = createNode(item.type, undefined, item.data)
    setNodes(nds => [...nds, newNode])
    setNodeDrawerOpen(false)
  }, [createNode, setNodes])

  const addCatalogItemAt = useCallback((item: NodeCatalogItem, position: XYPosition) => {
    const newNode = createNode(item.type, position, item.data)
    setNodes(nds => [...nds, newNode])
    setNodeDrawerOpen(false)
  }, [createNode, setNodes])

  const onNodeDragStart = useCallback((event: React.DragEvent, item: NodeCatalogItem) => {
    event.dataTransfer.setData('application/dstp-node-item', JSON.stringify({ type: item.type, data: item.data || {} }))
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
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
    } catch {
      return
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
          <span className="text-[11px] text-gray-500">automação do servidor</span>
        </div>

        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">{nodes.length} nodes · {edges.length} conexões</span>
          <button onClick={() => setNodeDrawerOpen(true)} className="text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors">Adicionar etapa</button>
          <button
            onClick={captureData?.active ? onStopCapture : onStartCapture}
            className={`text-xs px-4 py-2 rounded-lg border transition-colors ${captureData?.active ? 'bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/25'}`}
          >
            {captureData?.active ? 'Parar captura' : 'Testar'}
          </button>
          <span className={`text-xs transition-opacity ${autoSaveStatus === 'saved' ? 'text-green-300 opacity-100' : 'text-gray-300 opacity-100'}`}>
            {autoSaveStatus === 'saved' ? 'Salvo' : 'Salvo'}
          </span>
          <button onClick={handleSave} className="text-xs px-3 py-2 rounded bg-blue-500/20 text-blue-200 border border-blue-500/30 hover:bg-blue-500/30 transition-colors">Salvar</button>
        </div>
      </header>

      {/* Canvas */}
      <main className="absolute left-0 right-0 top-[68px] bottom-9" onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
        <ReactFlow
          nodes={nodesWithExecution}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          onInit={instance => { reactFlowRef.current = instance }}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ style: { stroke: '#555', strokeWidth: 2 }, animated: true }}
          style={{ background: '#0a0a0a' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#252525" />
          <Controls
            showInteractive={false}
            position="bottom-left"
            className="!bg-[#111] !border-white/10 !rounded-lg !shadow-none [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-gray-400 [&>button:hover]:!bg-white/5"
          />
          <MiniMap
            nodeColor={n => {
              // Migrated nodes carry their color in the registry meta.
              const regColor = n.type ? registryMetaByType[n.type]?.color : undefined
              if (regColor) return regColor
              if (n.type === 'trigger') return '#22c55e'
              if (n.type === 'condition') return '#eab308'
              if (n.type === 'http_request') return '#06b6d4'
              if (n.type === 'set_variable') return '#a855f7'
              if (n.type === 'script') return '#f97316'
              if (n.type === 'wait') return '#ec4899'
              return '#3b82f6'
            }}
            className="!bg-[#111] !border-white/10 !rounded-lg"
            maskColor="#0a0a0a90"
          />
        </ReactFlow>

        <button
          onClick={() => setNodeDrawerOpen(true)}
          className="absolute right-4 top-5 w-10 h-10 rounded-lg bg-white/5 border border-white/10 text-2xl text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
          title="Adicionar node"
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
      </main>

      {/* Bottom logs bar */}
      <footer className="absolute left-0 right-0 bottom-0 z-20 h-9 bg-[#0a0a0a] border-t border-white/5 flex items-center px-4">
        <button className="text-xs font-semibold text-white">Eventos e logs</button>
        <span className="ml-3 text-[10px] text-gray-500">{edges.length} conexoes · {nodes.length} nodes</span>
      </footer>

      {/* Node drawer */}
      {nodeDrawerOpen && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <button
            className="absolute inset-0 bg-black/10 pointer-events-auto"
            onClick={() => setNodeDrawerOpen(false)}
            aria-label="Fechar biblioteca de nodes"
          />
          <aside className="absolute right-0 top-[68px] bottom-9 w-[396px] bg-[#0f0f0f] border-l border-white/10 shadow-2xl pointer-events-auto flex flex-col">
            <div className="px-4 py-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Adicionar etapa</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Eventos, ações e UI ficam juntos aqui. Use busca ou filtros para achar rápido.
                  </p>
                </div>
                <button onClick={() => setNodeDrawerOpen(false)} className="text-gray-400 hover:text-white text-lg">×</button>
              </div>
              <div className="grid grid-cols-3 gap-1 mb-3 rounded-lg bg-white/[0.03] p-1 border border-white/5">
                {([
                  ['all', 'Todos'],
                  ['events', 'Eventos'],
                  ['nodes', 'Nodes'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setCatalogFilter(value)}
                    className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${catalogFilter === value ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={nodeSearch}
                onChange={e => setNodeSearch(e.target.value)}
                placeholder={catalogFilter === 'events' ? 'Buscar evento...' : catalogFilter === 'nodes' ? 'Buscar node...' : 'Buscar evento ou node...'}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500/40 focus:outline-none placeholder:text-gray-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              {Object.entries(catalogGroups).map(([category, items]) => (
                <div key={category} className="mb-2">
                  <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-gray-400">{category}</div>
                  {items.map(item => (
                    <button
                      key={`${item.type}:${item.data?.event_type || item.label}`}
                      draggable
                      onDragStart={event => onNodeDragStart(event, item)}
                      onClick={() => addCatalogItem(item)}
                      className="w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-colors group border-l-2 border-transparent hover:border-blue-500/60"
                      title="Arraste para o canvas ou clique para adicionar"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 flex items-center justify-center text-base ${item.accent}`}>{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white">{item.label}</div>
                          <div className="text-xs text-gray-300 leading-snug">{item.description}</div>
                        </div>
                        <span className="text-gray-500 group-hover:text-white">›</span>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
              {Object.keys(catalogGroups).length === 0 && (
                <div className="text-sm text-gray-400 text-center py-10">Nenhum node encontrado.</div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Compact inspector */}
      {inspectorOpen && selectedNode && !detailNode && (
        <aside className="absolute right-4 top-[84px] z-20 w-[320px] rounded-xl bg-[#111] border border-white/10 shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-white/10">
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wide text-gray-400">Node selecionado</div>
              <div className="text-sm font-semibold text-white truncate">{selectedNode.type}</div>
            </div>
            <button onClick={() => setDetailNodeId(selectedNode.id)} className="text-xs px-3 py-1.5 rounded bg-blue-500/20 text-blue-200 border border-blue-500/30 hover:bg-blue-500/30">
              Abrir
            </button>
            <button onClick={() => setInspectorOpen(false)} className="text-gray-400 hover:text-white">×</button>
          </div>
          <pre className="m-0 p-3 text-[10px] text-gray-300 whitespace-pre-wrap break-all max-h-[260px] overflow-auto bg-black/20">
            {JSON.stringify(selectedNode.data || {}, null, 2)}
          </pre>
        </aside>
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
    </div>
  )
}
