import { useCallback, useState, useMemo } from 'react'
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes'

interface FlowEditorProps {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onSave: (nodes: Node[], edges: Edge[]) => void
  flowName: string
  onNameChange: (name: string) => void
}

let nodeIdCounter = 0
const genId = () => `node_${Date.now()}_${nodeIdCounter++}`

export function FlowEditor({ initialNodes = [], initialEdges = [], onSave, flowName, onNameChange }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({
      ...params,
      id: `edge_${Date.now()}`,
      style: { stroke: '#444', strokeWidth: 2 },
      animated: true,
    }, eds))
  }, [setEdges])

  const addNode = useCallback((type: string) => {
    const defaults: Record<string, any> = {
      trigger: {},
      condition: {},
      action: { action_type: '', params: {} },
      http_request: { action_type: 'http_request', params: { url: '', method: 'GET', headers: '', body: '' } },
      set_variable: { action_type: 'set_variable', params: {} },
    }
    const newNode: Node = {
      id: genId(),
      type,
      position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 120 },
      data: defaults[type] || {},
    }
    setNodes(nds => [...nds, newNode])
  }, [nodes.length, setNodes])

  const handleSave = () => onSave(nodes, edges)

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
        <div className="flex-1" />
        <button onClick={handleSave} className="text-[10px] px-4 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-medium transition-colors">
          💾 Salvar
        </button>
      </div>

      {/* Flow Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ style: { stroke: '#333', strokeWidth: 2 }, animated: true }}
          style={{ background: '#0a0a0a' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a1a" />
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
              return '#3b82f6'
            }}
            className="!bg-[#111] !border-white/10 !rounded-lg"
            maskColor="#0a0a0a90"
          />
        </ReactFlow>
      </div>
    </div>
  )
}
