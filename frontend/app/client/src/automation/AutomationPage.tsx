import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Live } from '@/core/client'
import { LiveAutomation } from '@server/live/LiveAutomation'
import { LiveDSTP } from '@server/live/LiveDSTP'
import { FlowEditor } from './FlowEditor'
import type { Node, Edge } from '@xyflow/react'
import { AccountMenu } from '../components/AccountMenu'
import { EnvironmentsModal } from './EnvironmentsModal'
import { FlowExplorer } from './FlowExplorer'
import { PromptModal, ConfirmModal } from './FlowModal'

export function AutomationPage() {
  const auto = Live.use(LiveAutomation, { initialState: LiveAutomation.defaultState })
  const dstp = Live.use(LiveDSTP)

  const [searchParams, setSearchParams] = useSearchParams()
  const urlServer = searchParams.get('server') || ''
  const urlFlow = searchParams.get('flow')

  const [editingFlow, setEditingFlow] = useState<string | null>(urlFlow)
  const [flowName, setFlowName] = useState('')
  const [editorNodes, setEditorNodes] = useState<Node[]>([])
  const [editorEdges, setEditorEdges] = useState<Edge[]>([])
  const [originalCreatedAt, setOriginalCreatedAt] = useState<number | null>(null)
  const [flowEnabled, setFlowEnabled] = useState(true)
  const [flowFolder, setFlowFolder] = useState('')
  const [showEnvironments, setShowEnvironments] = useState(false)
  const [flowSearch, setFlowSearch] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderWarning, setFolderWarning] = useState<string | null>(null)
  // Subfolder/rename prompt: { mode, path } — path is the parent (subfolder) or the
  // folder being renamed.
  const [folderPrompt, setFolderPrompt] = useState<{ mode: 'subfolder' | 'rename'; path: string } | null>(null)

  // Sync editingFlow to URL
  useEffect(() => {
    const currentFlow = searchParams.get('flow')
    if (editingFlow && editingFlow !== currentFlow) {
      setSearchParams(prev => {
        prev.set('flow', editingFlow)
        return prev
      }, { replace: true })
    } else if (!editingFlow && currentFlow) {
      setSearchParams(prev => {
        prev.delete('flow')
        return prev
      }, { replace: true })
    }
  }, [editingFlow])

  const flows = (auto.$state as any)[`flows:${urlServer}`] || []
  const folders = (auto.$state as any)[`folders:${urlServer}`] || []
  const logs = (auto.$state as any)[`logs:${urlServer}`] || []
  const captureData = (auto.$state as any)[`capture:${urlServer}`] || null

  // Extract the latest log context for the currently editing flow
  const latestExecutionContext = useMemo(() => {
    // Use the capture context as soon as one is available for this flow. Capture
    // now stays active and emits after every execution (multi-trigger flows), so
    // we no longer wait for active===false — any captured context for the edited
    // flow wins.
    if (captureData && captureData.flowId === editingFlow && captureData.context) {
      return captureData.context
    }
    if (!editingFlow || logs.length === 0) return null
    const flowLogs = logs.filter((l: any) => l.flow_id === editingFlow || l.flowId === editingFlow)
    if (flowLogs.length === 0) return null
    const latest = flowLogs[flowLogs.length - 1]
    return latest?.context || null
  }, [editingFlow, logs, captureData])

  // Load flows when status becomes 'synced' (lib 0.9.0)
  // $status: mounting → connecting → loading → synced
  useEffect(() => {
    if (!urlServer) return
    const status = (auto as any).$status
    const componentId = (auto as any).$componentId
    // Only fire when fully ready (synced with a component ID)
    if (status === 'synced' && componentId) {
      auto.loadFlows({ server_id: urlServer })
    }
  }, [urlServer, (auto as any).$status, (auto as any).$componentId])

  const justCreatedRef = useRef<string | null>(null)

  const createNewFlow = () => {
    const id = `flow_${Date.now()}`
    justCreatedRef.current = id
    setEditingFlow(id)
    setFlowName('Novo Fluxo')
    setEditorNodes([])
    setEditorEdges([])
    setOriginalCreatedAt(null)
    setFlowEnabled(true)
    setFlowFolder('')
  }

  const editFlow = (flow: any) => {
    setEditingFlow(flow.id)
    setFlowName(flow.name)
    setEditorNodes(flow.nodes || [])
    setEditorEdges(flow.edges || [])
    setOriginalCreatedAt(flow.created_at || null)
    setFlowEnabled(flow.enabled ?? true)
    setFlowFolder(flow.folderPath ?? flow.folder_path ?? '')
  }

  // When URL has ?flow=ID and flows list loads, hydrate the editor with that flow's data
  const [hydrated, setHydrated] = useState<string | null>(null)
  useEffect(() => {
    if (!editingFlow || flows.length === 0) return
    if (hydrated === editingFlow) return
    const flow = flows.find((f: any) => f.id === editingFlow)
    if (flow) {
      setFlowName(flow.name)
      setEditorNodes(flow.nodes || [])
      setEditorEdges(flow.edges || [])
      setOriginalCreatedAt(flow.created_at || null)
      setFlowEnabled(flow.enabled ?? true)
      setFlowFolder(flow.folderPath ?? flow.folder_path ?? '')
      setHydrated(editingFlow) // triggers re-render AFTER state updates are applied
    }
  }, [editingFlow, flows, hydrated])

  const saveFlow = async (nodes: Node[], edges: Edge[], closeAfter = false) => {
    if (!editingFlow || !urlServer) return
    try {
      // Use the flow's current enabled state from the live list when available,
      // so an autosave can't silently re-enable a flow that was disabled
      // elsewhere while the editor was open. Fall back to the editor state.
      const currentFlow = flows.find((f: any) => f.id === editingFlow)
      const enabled = currentFlow ? (currentFlow.enabled ?? flowEnabled) : flowEnabled
      const result = await auto.saveFlow({
        flow: {
          id: editingFlow,
          name: flowName || 'Sem nome',
          enabled,
          server_id: urlServer,
          nodes: nodes.map(n => ({ id: n.id, type: n.type as any, data: n.data, position: n.position })),
          edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || undefined, targetHandle: e.targetHandle || undefined })),
          created_at: originalCreatedAt || Date.now(),
          trigger_count: 0,
          folder_path: flowFolder,
        }
      })
      console.log('[DSTP] Flow saved:', editingFlow, result)
      if (closeAfter) setEditingFlow(null)
    } catch (err) {
      console.error('[DSTP] saveFlow error:', err)
      alert('Erro ao salvar: ' + (err as Error).message)
    }
  }

  const deleteFlow = async (id: string) => {
    await auto.deleteFlow({ flow_id: id, server_id: urlServer })
  }

  const toggleFlow = async (id: string, enabled: boolean) => {
    await auto.toggleFlow({ flow_id: id, server_id: urlServer, enabled })
  }

  const moveFlow = async (id: string, folder_path: string, sort_order: number) => {
    await auto.moveFlow({ flow_id: id, server_id: urlServer, folder_path, sort_order })
  }

  // Registered folder paths (incl. empty ones) for the tree.
  const folderPaths = useMemo(() => (folders as any[]).map(f => f.path as string), [folders])

  // Distinct folder paths for the editor's datalist (registered + derived from flows).
  const folderSuggestions = useMemo(() => {
    const set = new Set<string>(folderPaths)
    for (const f of flows as any[]) {
      const p = (f.folderPath ?? f.folder_path ?? '').trim()
      if (p) set.add(p)
    }
    return [...set].sort()
  }, [flows, folderPaths])

  const createFolder = async (path: string) => {
    await auto.createFolder({ server_id: urlServer, path })
  }

  const deleteFolder = async (path: string) => {
    const res: any = await auto.deleteFolder({ server_id: urlServer, path })
    if (res && res.success === false && res.reason === 'not_empty') {
      setFolderWarning(`Não dá para excluir a pasta "${path}": ainda tem ${res.count} fluxo(s) dentro.\nMova-os para outra pasta antes de excluir.`)
    }
  }

  const moveFolder = async (path: string, newParent: string) => {
    await auto.moveFolder({ server_id: urlServer, path, new_parent: newParent })
  }

  const reorderFolder = async (path: string, sortOrder: number) => {
    await auto.reorderFolder({ server_id: urlServer, path, sort_order: sortOrder })
  }

  const renameFolder = async (path: string, newName: string) => {
    await auto.renameFolder({ server_id: urlServer, path, new_name: newName })
  }

  // Resolve the folderPrompt (subfolder create OR rename) with the typed value.
  const submitFolderPrompt = async (value: string) => {
    if (!folderPrompt) return
    if (folderPrompt.mode === 'subfolder') {
      await auto.createFolder({ server_id: urlServer, path: `${folderPrompt.path}/${value}` })
    } else {
      await renameFolder(folderPrompt.path, value)
    }
  }

  const exportFlow = (flow: any) => {
    const exportData = {
      name: flow.name,
      nodes: flow.nodes || [],
      edges: flow.edges || [],
      exported_at: Date.now(),
      version: 1,
    }
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(flow.name || 'flow').replace(/[^a-zA-Z0-9_-]/g, '_')}.dstp.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const importFlow = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)

        // Bundle: multiple flows at once (exported via "Exportar tudo")
        if (Array.isArray(parsed.flows)) {
          if (!confirm(`Importar ${parsed.flows.length} fluxo(s)? Serão criados como novos (não sobrescrevem existentes).`)) return
          let ok = 0, fail = 0
          const base = Date.now()
          for (let i = 0; i < parsed.flows.length; i++) {
            const f = parsed.flows[i]
            if (!f.nodes || !f.edges) { fail++; continue }
            try {
              await auto.saveFlow({
                flow: {
                  id: `flow_${base}_${i}`,
                  name: f.name || `Fluxo ${i + 1}`,
                  enabled: false,
                  server_id: urlServer,
                  nodes: f.nodes,
                  edges: f.edges,
                  created_at: base + i,
                  trigger_count: 0,
                }
              })
              ok++
            } catch { fail++ }
          }
          await auto.loadFlows({ server_id: urlServer })
          alert(`Importação concluída: ${ok} ok, ${fail} falharam.`)
          return
        }

        // Single flow (legacy format)
        if (!parsed.nodes || !parsed.edges) {
          alert('Arquivo inválido: faltam nodes ou edges.')
          return
        }
        const id = `flow_${Date.now()}`
        await auto.saveFlow({
          flow: {
            id,
            name: parsed.name || 'Fluxo Importado',
            enabled: false,
            server_id: urlServer,
            nodes: parsed.nodes,
            edges: parsed.edges,
            created_at: Date.now(),
            trigger_count: 0,
          }
        })
        await auto.loadFlows({ server_id: urlServer })
      } catch (err: any) {
        alert(`Erro ao importar: ${err.message}`)
      }
    }
    reader.readAsText(file)
  }

  const exportAllFlows = () => {
    if (!flows || flows.length === 0) {
      alert('Nenhum fluxo para exportar.')
      return
    }
    const bundle = {
      version: 1,
      kind: 'dstp.flows.bundle',
      exported_at: Date.now(),
      server_id: urlServer,
      flow_count: flows.length,
      flows: flows.map((f: any) => ({
        name: f.name,
        enabled: f.enabled,
        nodes: f.nodes || [],
        edges: f.edges || [],
      })),
    }
    const json = JSON.stringify(bundle, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dstp-flows-${urlServer}-${new Date().toISOString().slice(0,10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Editor mode
  if (editingFlow) {
    // Wait for state to arrive before rendering the editor.
    // This prevents auto-save from overwriting with empty nodes when opening via URL.
    const alreadyHydrated = hydrated === editingFlow
    const componentReady = (auto as any).$status === 'synced'
    const stateArrived = (auto.$state as any)[`flows:${urlServer}`] !== undefined
    const flowExistsInList = flows.some((f: any) => f.id === editingFlow)

    // Brand new flow (just created via createNewFlow): allow immediately (no server data yet)
    const isBrandNewFlow = justCreatedRef.current === editingFlow

    if (!alreadyHydrated && !isBrandNewFlow) {
      // Wait until: component synced + state actually arrived + flow found
      if (!componentReady || !stateArrived || !flowExistsInList) {
        return (
          <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
            <div className="text-center">
              <div className="text-3xl mb-3 animate-pulse">⏳</div>
              <p className="text-gray-500 text-sm">Carregando fluxo...</p>
              <p className="text-gray-600 text-[10px] mt-2">
                {!componentReady ? 'conectando...' : !stateArrived ? 'buscando automações...' : 'fluxo não encontrado'}
              </p>
            </div>
          </div>
        )
      }
    }

    return (
      <div className="h-screen bg-[#0a0a0a]">
        <FlowEditor
          key={editingFlow || 'new'}
          initialNodes={editorNodes}
          initialEdges={editorEdges}
          onSave={saveFlow}
          flowName={flowName}
          onNameChange={setFlowName}
          folderPath={flowFolder}
          onFolderChange={setFlowFolder}
          folderSuggestions={folderSuggestions}
          onBack={() => setEditingFlow(null)}
          executionContext={latestExecutionContext}
          captureData={editingFlow ? (captureData?.flowId === editingFlow ? captureData : captureData?.active ? captureData : null) : null}
          onStartCapture={() => auto.startCapture({ server_id: urlServer })}
          onStopCapture={() => auto.stopCapture({ server_id: urlServer })}
        />
      </div>
    )
  }

  // List mode
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
        <Link to={`/?server=${urlServer}`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Painel</Link>
        <div className="h-4 w-px bg-white/10" />
        <h1 className="text-lg font-bold text-white">⚡ Automações</h1>
        <span className="text-[10px] text-gray-600">{urlServer}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${auto.$connected ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {auto.$connected ? '● Connected' : '○ Offline'}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => auto.loadFlows({ server_id: urlServer })}
          className="text-xs px-3 py-2 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors"
          title="Recarregar"
        >↻</button>
        <button
          onClick={exportAllFlows}
          className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 font-medium transition-colors"
          title="Exporta todos os fluxos deste servidor em um arquivo"
        >↓ Exportar tudo</button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 font-medium transition-colors"
          title="Importar fluxo único ou bundle com vários"
        >↑ Importar</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.dstp.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importFlow(file)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => setShowEnvironments(true)}
          className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 font-medium transition-colors"
          title="Variáveis de ambiente criptografadas (API keys, tokens)"
        >🔑 Environments</button>
        <button
          onClick={createNewFlow}
          className="text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 font-medium transition-colors"
        >+ Novo Fluxo</button>
        {urlServer && <AccountMenu serverId={urlServer} />}
      </div>
      {showEnvironments && urlServer && (
        <EnvironmentsModal serverId={urlServer} onClose={() => setShowEnvironments(false)} />
      )}
      {showNewFolder && (
        <PromptModal
          title="Nova pasta"
          label='Caminho (use "/" para aninhar, ex: Loja/Eventos)'
          placeholder="Loja/Eventos"
          confirmLabel="Criar"
          onConfirm={createFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}
      {folderWarning && (
        <ConfirmModal
          title="Pasta não vazia"
          message={folderWarning}
          confirmLabel="Entendi"
          onClose={() => setFolderWarning(null)}
        />
      )}
      {folderPrompt && (
        <PromptModal
          title={folderPrompt.mode === 'subfolder' ? `Nova subpasta em "${folderPrompt.path}"` : `Renomear "${folderPrompt.path}"`}
          label={folderPrompt.mode === 'subfolder' ? 'Nome da subpasta' : 'Novo nome'}
          placeholder={folderPrompt.mode === 'subfolder' ? 'Eventos' : folderPrompt.path.split('/').pop()}
          initialValue={folderPrompt.mode === 'rename' ? (folderPrompt.path.split('/').pop() || '') : ''}
          confirmLabel={folderPrompt.mode === 'subfolder' ? 'Criar' : 'Renomear'}
          onConfirm={submitFolderPrompt}
          onClose={() => setFolderPrompt(null)}
        />
      )}

      <div className="flex gap-4">
        {/* Flows list */}
        <div className="flex-1">
          {flows.length === 0 && folderPaths.length === 0 ? (
            !auto.$connected ? (
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center">
                <div className="text-2xl mb-2 animate-pulse">⏳</div>
                <p className="text-gray-500 text-sm">Conectando ao backend...</p>
              </div>
            ) : (auto.$state as any)[`flows:${urlServer}`] === undefined ? (
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center">
                <div className="text-2xl mb-2 animate-pulse">⏳</div>
                <p className="text-gray-500 text-sm">Carregando automações...</p>
              </div>
            ) : (
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center">
              <div className="text-2xl mb-2">⚡</div>
              <p className="text-gray-500 text-sm mb-4">Nenhuma automação criada</p>
              <button
                onClick={createNewFlow}
                className="text-xs px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
              >Criar primeiro fluxo</button>
            </div>
            )
          ) : (
            <div className="space-y-2">
              {/* Search filter + new folder */}
              <div className="flex gap-2">
                <input
                  value={flowSearch}
                  onChange={e => setFlowSearch(e.target.value)}
                  placeholder="🔎 Buscar fluxo por nome..."
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-blue-400/40 focus:outline-none"
                />
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="text-xs px-3 py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 whitespace-nowrap transition-colors"
                  title="Criar uma pasta (pode ficar vazia)"
                >📁 Nova pasta</button>
              </div>
              <FlowExplorer
                flows={flows}
                folders={folders}
                search={flowSearch}
                onMove={moveFlow}
                onMoveFolder={moveFolder}
                onReorderFolder={reorderFolder}
                onDeleteFolder={deleteFolder}
                onCreateSubfolder={(parent) => setFolderPrompt({ mode: 'subfolder', path: parent })}
                onRenameFolder={(path) => setFolderPrompt({ mode: 'rename', path })}
                renderFlow={(flow: any) => (
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      {/* drag handle hint */}
                      <span className="text-gray-600 text-xs cursor-grab" title="Arraste para mover de pasta / reordenar">⠿</span>
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
                        onClick={() => exportFlow(flow)}
                        className="text-[10px] px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5 transition-colors"
                      >↗ Exportar</button>
                      <button
                        onClick={() => deleteFlow(flow.id)}
                        className="text-[10px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                      >🗑</button>
                    </div>
                  </div>
                )}
              />
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
                <span className="text-gray-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="text-blue-400 font-semibold ml-1.5">{log.flow_name}</span>
                <div className="text-gray-500 mt-0.5">
                  ⚡ {log.event_type} → {log.actions.join(', ') || 'nenhuma ação'}
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-gray-500 text-xs text-center py-4">Sem logs</p>}
          </div>

          {/* Recent Events */}
          <div className="mt-3 pt-3 border-t border-white/5">
            <h3 className="text-xs font-semibold text-white flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Eventos Recentes
            </h3>
            <div className="space-y-0.5">
              {(() => {
                const events = (dstp.$state as any)?.events || []
                const recent = [...events].reverse().slice(0, 30)
                if (recent.length === 0) return <p className="text-gray-500 text-xs text-center py-2">Sem eventos</p>
                return recent.map((evt: any, i: number) => (
                  <div key={i} className="py-1 px-2 rounded-md hover:bg-white/[0.02] text-[10px] group cursor-pointer" onClick={() => {
                    const el = document.getElementById(`evt-detail-${i}`)
                    if (el) el.classList.toggle('hidden')
                  }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 font-mono">{new Date(evt.received_at || evt.timestamp).toLocaleTimeString()}</span>
                      <span className="text-amber-400 font-semibold">{evt.type}</span>
                    </div>
                    <div id={`evt-detail-${i}`} className="hidden mt-1 p-1.5 rounded bg-black/30 text-[9px] font-mono text-gray-400 whitespace-pre-wrap break-all">
                      {JSON.stringify(evt.data || evt, null, 2)}
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
