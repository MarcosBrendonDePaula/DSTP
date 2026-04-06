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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes'
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
  executionContext?: Record<string, any> | null
  captureData?: CaptureData | null
  onStartCapture?: () => void
  onStopCapture?: () => void
}

let nodeIdCounter = 0
const genId = () => `node_${Date.now()}_${nodeIdCounter++}`

export function FlowEditor({ initialNodes = [], initialEdges = [], onSave, flowName, onNameChange, executionContext, captureData, onStartCapture, onStopCapture }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)

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

  // Inject execution status + capture indicator into node data
  const nodesWithExecution = useMemo(() => {
    const traceNodeIds = new Set((captureData?.trace || []).map(t => t.nodeId))
    const hasStatuses = Object.keys(nodeStatuses).length > 0
    const hasTrace = traceNodeIds.size > 0

    if (!hasStatuses && !hasTrace) return nodes

    return nodes.map(node => {
      const execStatus = nodeStatuses[node.id]
      const hasCaptureData = traceNodeIds.has(node.id)
      if (!execStatus && !hasCaptureData) return node
      return {
        ...node,
        data: {
          ...node.data,
          ...(execStatus ? { _executionStatus: execStatus.status, _executionOutput: execStatus.output, _executionError: execStatus.error } : {}),
          ...(hasCaptureData ? { _hasCaptureData: true } : {}),
        },
      }
    })
  }, [nodes, nodeStatuses, captureData?.trace])

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

  const addNode = useCallback((type: string) => {
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
    }
    const newNode: Node = {
      id: genId(),
      type,
      position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 120 },
      data: defaults[type] || {},
    }
    setNodes(nds => [...nds, newNode])
  }, [nodes.length, setNodes])

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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0a0a0a]">
        <input
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white flex-1 max-w-[250px] focus:border-blue-500/30 focus:outline-none"
          placeholder="Nome do fluxo..."
          value={flowName}
          onChange={e => onNameChange(e.target.value)}
        />
        <div className="h-4 w-px bg-white/10" />
        <button onClick={() => addNode('trigger')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 transition-colors">
          ⚡ Trigger
        </button>
        <button onClick={() => addNode('condition')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/25 transition-colors">
          ❓ Condition
        </button>
        <button onClick={() => addNode('action')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25 transition-colors">
          🎯 Action
        </button>
        <button onClick={() => addNode('http_request')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/25 transition-colors">
          🌐 HTTP
        </button>
        <button onClick={() => addNode('set_variable')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/20 hover:bg-purple-500/25 transition-colors">
          📝 Variable
        </button>
        <button onClick={() => addNode('get_player')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-teal-500/15 text-teal-400 border border-teal-500/20 hover:bg-teal-500/25 transition-colors">
          👤 Player
        </button>
        <button onClick={() => addNode('find_player')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-teal-500/15 text-teal-400 border border-teal-500/20 hover:bg-teal-500/25 transition-colors">
          🔍 Find
        </button>
        <button onClick={() => addNode('delay')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-gray-500/15 text-gray-400 border border-gray-500/20 hover:bg-gray-500/25 transition-colors">
          ⏱ Delay
        </button>
        <button onClick={() => addNode('memory')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-colors">
          💾 Memory
        </button>
        <button onClick={() => addNode('wait')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-pink-500/15 text-pink-400 border border-pink-500/20 hover:bg-pink-500/25 transition-colors">
          🔀 Wait
        </button>
        <button onClick={() => addNode('script')} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/20 hover:bg-orange-500/25 transition-colors">
          🧩 Script
        </button>
        <div className="flex-1" />
        {captureData?.active ? (
          <button onClick={onStopCapture} className="text-[10px] px-4 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 font-medium transition-colors flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            Parar Captura
          </button>
        ) : (
          <button onClick={onStartCapture} className="text-[10px] px-4 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25 font-medium transition-colors">
            Iniciar Captura
          </button>
        )}
        <button onClick={handleSave} className="text-[10px] px-4 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-medium transition-colors">
          Salvar
        </button>
        <span className={`text-[9px] text-green-400 transition-opacity ${autoSaveStatus === 'saved' ? 'opacity-100' : 'opacity-0'}`}>
          ✓ Salvo
        </span>
      </div>

      {/* Flow Canvas (full width, no side panel) */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodesWithExecution}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ style: { stroke: '#555', strokeWidth: 2 }, animated: true }}
          style={{ background: '#0a0a0a' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#252525" />
          <Controls
            showInteractive={false}
            className="!bg-[#111] !border-white/10 !rounded-lg !shadow-none [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-gray-400 [&>button:hover]:!bg-white/5"
          />
          <MiniMap
            nodeColor={n => {
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
      </div>

      {/* Node Detail Modal (overlay) */}
      {detailNode && (
        <NodeDetailPanel
          node={detailNode}
          onClose={() => setDetailNodeId(null)}
          captureTrace={captureData?.trace || null}
          captureContext={captureData?.context || executionContext || null}
          allNodes={nodes}
          allEdges={edges.map(e => ({ source: e.source, target: e.target }))}
        />
      )}
    </div>
  )
}
