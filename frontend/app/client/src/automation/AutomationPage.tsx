import { useState, useMemo, useEffect } from 'react'
import { Live } from '@/core/client'
import { LiveAutomation } from '@server/live/LiveAutomation'
import { FlowEditor } from './FlowEditor'
import type { Node, Edge } from '@xyflow/react'

export function AutomationPage() {
  const auto = Live.use(LiveAutomation, { initialState: LiveAutomation.defaultState })

  const urlServer = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('server') || ''
  }, [])

  const [editingFlow, setEditingFlow] = useState<string | null>(null)
  const [flowName, setFlowName] = useState('')
  const [editorNodes, setEditorNodes] = useState<Node[]>([])
  const [editorEdges, setEditorEdges] = useState<Edge[]>([])
  const [originalCreatedAt, setOriginalCreatedAt] = useState<number | null>(null)

  const flows = auto.$state.flows || []
  const logs = auto.$state.logs || []

  // Load flows from DB on mount
  useEffect(() => {
    if (urlServer && auto.$connected) {
      auto.loadFlows({ server_id: urlServer })
    }
  }, [urlServer, auto.$connected])

  const createNewFlow = () => {
    const id = `flow_${Date.now()}`
    setEditingFlow(id)
    setFlowName('Novo Fluxo')
    setEditorNodes([])
    setEditorEdges([])
    setOriginalCreatedAt(null)
  }

  const editFlow = (flow: any) => {
    setEditingFlow(flow.id)
    setFlowName(flow.name)
    setEditorNodes(flow.nodes || [])
    setEditorEdges(flow.edges || [])
    setOriginalCreatedAt(flow.created_at || null)
  }

  const saveFlow = async (nodes: Node[], edges: Edge[]) => {
    if (!editingFlow || !urlServer) return
    await auto.saveFlow({
      flow: {
        id: editingFlow,
        name: flowName || 'Sem nome',
        enabled: true,
        server_id: urlServer,
        nodes: nodes.map(n => ({ id: n.id, type: n.type as any, data: n.data, position: n.position })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || undefined, targetHandle: e.targetHandle || undefined })),
        created_at: originalCreatedAt || Date.now(),
        trigger_count: 0,
      }
    })
    setEditingFlow(null)
  }

  const deleteFlow = async (id: string) => {
    await auto.deleteFlow({ flow_id: id, server_id: urlServer })
  }

  const toggleFlow = async (id: string, enabled: boolean) => {
    await auto.toggleFlow({ flow_id: id, server_id: urlServer, enabled })
  }

  // Editor mode
  if (editingFlow) {
    return (
      <div className="h-screen flex flex-col bg-[#0a0a0a]">
        {/* Back bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
          <button
            onClick={() => setEditingFlow(null)}
            className="text-[10px] px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5 transition-colors"
          >← Voltar</button>
          <span className="text-xs text-gray-500">Editando: {flowName}</span>
        </div>
        <div className="flex-1">
          <FlowEditor
            initialNodes={editorNodes}
            initialEdges={editorEdges}
            onSave={saveFlow}
            flowName={flowName}
            onNameChange={setFlowName}
          />
        </div>
      </div>
    )
  }

  // List mode
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
        <a href={`/?server=${urlServer}`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Painel</a>
        <div className="h-4 w-px bg-white/10" />
        <h1 className="text-lg font-bold text-white">⚡ Automações</h1>
        <span className="text-[10px] text-gray-600">{urlServer}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${auto.$connected ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {auto.$connected ? '● Connected' : '○ Offline'}
        </span>
        <div className="flex-1" />
        <button
          onClick={createNewFlow}
          className="text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-medium transition-colors"
        >+ Novo Fluxo</button>
      </div>

      <div className="flex gap-4">
        {/* Flows list */}
        <div className="flex-1">
          {flows.length === 0 ? (
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center">
              <div className="text-2xl mb-2">⚡</div>
              <p className="text-gray-500 text-sm mb-4">Nenhuma automação criada</p>
              <button
                onClick={createNewFlow}
                className="text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
              >Criar primeiro fluxo</button>
            </div>
          ) : (
            <div className="space-y-2">
              {flows.map((flow: any) => (
                <div key={flow.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Toggle */}
                    <button
                      onClick={() => toggleFlow(flow.id, !flow.enabled)}
                      className={`w-8 h-4 rounded-full transition-colors relative ${flow.enabled ? 'bg-green-500/30' : 'bg-white/10'}`}
                    >
                      <div className={`w-3 h-3 rounded-full absolute top-0.5 transition-all ${flow.enabled ? 'left-4 bg-green-400' : 'left-0.5 bg-gray-500'}`} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{flow.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${flow.enabled ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-gray-500'}`}>
                          {flow.enabled ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {flow.nodes?.length || 0} nodes · {flow.edges?.length || 0} conexões
                        {flow.trigger_count > 0 && <> · Disparou {flow.trigger_count}x</>}
                        {flow.last_triggered && <> · Último: {new Date(flow.last_triggered).toLocaleTimeString()}</>}
                      </div>
                    </div>

                    <button
                      onClick={() => editFlow(flow)}
                      className="text-[10px] px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5 transition-colors"
                    >✏️ Editar</button>
                    <button
                      onClick={() => deleteFlow(flow.id)}
                      className="text-[10px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                    >🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logs */}
        <div className="w-[320px] shrink-0 bg-white/[0.015] border border-white/5 rounded-xl p-3" style={{ maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-white flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Logs
            </h3>
            {logs.length > 0 && (
              <button onClick={() => auto.clearLogs({ server_id: urlServer })} className="text-[9px] text-gray-600 hover:text-gray-400">Limpar</button>
            )}
          </div>
          <div className="space-y-0.5">
            {[...logs].reverse().map((log: any, i: number) => (
              <div key={i} className="py-1.5 px-2 rounded-md hover:bg-white/[0.02] text-[10px]">
                <span className="text-gray-700 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="text-blue-400 font-semibold ml-1.5">{log.flow_name}</span>
                <div className="text-gray-500 mt-0.5">
                  ⚡ {log.event_type} → {log.actions.join(', ') || 'nenhuma ação'}
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-gray-700 text-xs text-center py-4">Sem logs</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
