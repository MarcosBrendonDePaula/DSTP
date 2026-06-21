// LiveAutomation - Manages automation flows with Drizzle ORM + SQLite
//
// This is the LiveComponent (UI actions: flow CRUD, capture, etc). The actual
// flow execution motor lives in FlowEngine.ts and is driven here via an
// injectable "host". LiveAutomation supplies a "direct host" that wires the
// engine to dstStateStore (commands / player groups / event toggles) and to
// this.setState (STATE_DELTA to the panel).

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import { FlowRepository, FolderRepository, AutomationLogRepository, EventSchemaRepository, ServerConfigRepository, type FlowNode, type FlowEdge } from '../db'
import { invalidateAnalysis } from './FlowAnalyzer'
import { WorkflowInstanceStore } from './WorkflowInstanceStore'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { serverCoreManager, setPanelEmitter } from './ServerCoreManager'
import { streamObject } from 'ai'
import { buildModel } from './ai/buildModel'
import { installVaultAccessors } from './vault-context'
import { resolveValue } from './expressions'
import { generateFlowFromPrompt, editFlowWithPrompt, type GenFlow, type RunModel } from './ai/generateFlow'

// Route the panel STATE_DELTA emitter to whatever LiveAutomation instance is
// currently mounted. Per-server worker cores emit panel state via this seam.
setPanelEmitter((delta) => {
  if (_automationInstance) (_automationInstance as any).setState(delta)
})

// ─── State ───────────────────────────────────────────

interface AutomationState {
  flows: any[]
  logs: any[]
}

let _automationInstance: LiveAutomation | null = null

// Singleton engine that survives even without a Live Component client.
// Created lazily with a headless host (emitState assigns onto a local state
// object). When a real LiveAutomation mounts, it re-points the engine at its
// own setState-backed host so STATE_DELTA reaches connected clients.
let _engine: FlowEngine | null = null
const _headlessState: Record<string, any> = {}
const _headlessHost: EngineHost = {
  pushCommand: (serverId, type, data) => dstStateStore.pushCommandToServer(serverId, type, data),
  getServerGroups: () => dstStateStore.getServerGroups(),
  emitState: (delta) => { Object.assign(_headlessState, delta) },
  requestEventToggle: (serverId, cat, en) => dstStateStore.requestEventToggleForServer(serverId, cat, en),
  requestWatchKeys: (serverId, keys, combos) => dstStateStore.requestWatchKeysForServer(serverId, keys, combos),
}

function _getEngine(): FlowEngine {
  if (!_engine) {
    _engine = new FlowEngine(_headlessHost)
  }
  return _engine
}

// Ensure a usable instance always exists for event processing
function _getOrCreateInstance(): LiveAutomation {
  if (!_automationInstance) {
    // Create a headless instance that works without Live Component clients
    _automationInstance = Object.create(LiveAutomation.prototype) as LiveAutomation
    ;(_automationInstance as any).state = LiveAutomation.defaultState
    ;(_automationInstance as any).setState = function(delta: any) {
      Object.assign(this.state, delta)
    }
  }
  return _automationInstance
}

// Events are routed to the server's dedicated worker core. The inline headless
// engine remains available (getFlowEngine) for UI actions that need synchronous
// DB access on the main thread (capture toggles, flow CRUD), but event execution
// itself runs in the per-server worker.
export function processAutomationEvent(server_id: string, event: any) {
  serverCoreManager.route(server_id, event)
}

// Recompute and (re)request the key_pressed watch set for a server. Called by the
// sync route when a shard (re)connects — the mod-side watch set is lost on a game/
// server restart, but the backend may still hold last_keys and wouldn't otherwise
// re-send. We clear last_keys for the server's shards so the recompute always
// re-delivers, then collectWatchKeys derives the set from the enabled flows.
export function reconcileWatchKeys(server_id: string) {
  try {
    dstStateStore.resetWatchKeysFor(server_id)
    _getEngine().collectWatchKeys(server_id)
  } catch (e) {
    console.error('[DSTP Automation] reconcileWatchKeys', e)
  }
}

// ─── Component ───────────────────────────────────────

export class LiveAutomation extends LiveComponent<AutomationState> {
  static componentName = 'LiveAutomation'
  static singleton = true
  static publicActions = [
    'saveFlow',
    'deleteFlow',
    'toggleFlow',
    'moveFlow',
    'createFolder',
    'deleteFolder',
    'reorderFolder',
    'moveFolder',
    'renameFolder',
    'toggleFolder',
    'loadFlows',
    'clearLogs',
    'getEventSchemas',
    'exportFlow',
    'importFlow',
    'startCapture',
    'stopCapture',
    'generateFlow',
    'editFlow',
    'getServerConfig',
    'setServerConfig',
  ] as const

  // Flow execution engine — bound to a host that emits STATE_DELTA via this.setState
  private _engine!: FlowEngine

  // Static proxies kept for backward compatibility with any external callers.
  static getStore(serverId: string): Record<string, any> {
    return _getEngine().getStore(serverId)
  }

  static clearStore(serverId: string) {
    _getEngine().clearStore(serverId)
  }

  static defaultState: AutomationState = {
    flows: [],
    logs: [],
  }

  private _ensureEngine(): FlowEngine {
    // Reuse the process-wide singleton engine so state (flow storage, capture)
    // survives across component mounts/HMR. Re-point its host at this component
    // so STATE_DELTA flows through this.setState to connected clients.
    const engine = _getEngine()
    const directHost: EngineHost = {
      pushCommand: (serverId, type, data) => dstStateStore.pushCommandToServer(serverId, type, data),
      getServerGroups: () => dstStateStore.getServerGroups(),
      emitState: (delta) => this.setState(delta as any),
      requestEventToggle: (serverId, cat, en) => dstStateStore.requestEventToggleForServer(serverId, cat, en),
      requestWatchKeys: (serverId, keys, combos) => dstStateStore.requestWatchKeysForServer(serverId, keys, combos),
    }
    engine.setHost(directHost)
    this._engine = engine
    return this._engine
  }

  protected onMount() {
    _automationInstance = this
    this._ensureEngine()
  }

  protected onDestroy() {
    if (_automationInstance === this) _automationInstance = null
    // Restore the headless host so background event processing keeps working
    // after the live component is gone.
    if (_engine) _engine.setHost(_headlessHost)
  }

  // ─── Helpers ───────────────────────────────────────

  private flowRepo(serverId: string) { return new FlowRepository(serverId) }
  private folderRepo(serverId: string) { return new FolderRepository(serverId) }
  private logRepo(serverId: string) { return new AutomationLogRepository(serverId) }

  private syncState(serverId: string) {
    const flows = this.flowRepo(serverId).findAll()
    const logs = this.logRepo(serverId).findRecent()
    const folders = this.folderRepo(serverId).findAll()
    console.log(`[DSTP Automation] syncState(${serverId}): ${flows.length} flows, ${logs.length} logs`)
    this.setState({ [`flows:${serverId}`]: flows, [`logs:${serverId}`]: logs, [`folders:${serverId}`]: folders } as any)
  }

  // ─── Flow CRUD ─────────────────────────────────────

  async saveFlow(payload: { flow: any }) {
    const { flow } = payload
    console.log(`[DSTP Automation] saveFlow called: id=${flow?.id}, name=${flow?.name}, nodes=${flow?.nodes?.length}`)
    if (!flow?.id || !flow?.server_id) throw new Error('flow with id and server_id required')

    // Safety guard: refuse to overwrite an existing non-empty flow with empty nodes
    // This prevents race conditions where the editor auto-saves before data is hydrated
    const nodesLen = (flow.nodes || []).length
    if (nodesLen === 0) {
      const existing = this.flowRepo(flow.server_id).findById(flow.id)
      if (existing && (existing.nodes as any[]).length > 0) {
        console.warn(`[DSTP Automation] saveFlow REFUSED: attempt to overwrite ${flow.id} (${(existing.nodes as any[]).length} nodes) with empty flow`)
        return { success: false, reason: 'refused_empty_overwrite' }
      }
    }

    try {
      this.flowRepo(flow.server_id).save({
        id: flow.id,
        name: flow.name,
        enabled: flow.enabled ?? true,
        nodes: flow.nodes || [],
        edges: flow.edges || [],
        // Organization fields are partial-updated by the repo (undefined = leave
        // as-is), so import/create can seed a folder without an editor save wiping it.
        folderPath: flow.folderPath ?? flow.folder_path,
        sortOrder: flow.sortOrder ?? flow.sort_order,
      })
      console.log(`[DSTP Automation] saveFlow: DB write OK for ${flow.id} (${nodesLen} nodes)`)
    } catch (err: any) {
      console.error(`[DSTP Automation] saveFlow ERROR:`, err.message, err.stack)
      throw err
    }

    // Register the folder so it sticks even if this flow later leaves it.
    const fp = (flow.folderPath ?? flow.folder_path ?? '').trim?.() ?? ''
    if (fp) this.folderRepo(flow.server_id).create(fp)

    invalidateAnalysis(flow.id)
    this._ensureEngine().ensureEventCategories(flow)
    this._ensureEngine().collectWatchKeys(flow.server_id)  // key_pressed watch set
    this.syncState(flow.server_id)
    return { success: true }
  }

  // ── Per-server config (feature flags) ───────────────────────────────────────
  private cfgRepo(serverId: string) { return new ServerConfigRepository(serverId) }

  // Read config the client needs (currently just the AI-flows flag).
  async getServerConfig(payload: { server_id: string }) {
    if (!payload?.server_id) return { ai_flows_enabled: false }
    return { ai_flows_enabled: this.cfgRepo(payload.server_id).getBool('ai_flows_enabled', false) }
  }

  async setServerConfig(payload: { server_id: string; ai_flows_enabled?: boolean }) {
    if (!payload?.server_id) return { success: false }
    if (typeof payload.ai_flows_enabled === 'boolean') {
      this.cfgRepo(payload.server_id).setBool('ai_flows_enabled', payload.ai_flows_enabled)
    }
    return { success: true, ai_flows_enabled: this.cfgRepo(payload.server_id).getBool('ai_flows_enabled', false) }
  }

  private aiEnabled(serverId: string): boolean {
    return this.cfgRepo(serverId).getBool('ai_flows_enabled', false)
  }

  // Build the LLM caller for flow generation/edit. The API key is resolved from the
  // vault the SAME way a flow run resolves {{environment.X.KEY}} — installed lazily
  // on a throwaway context, never returned to the client, masked in logs. Returns a
  // RunModel that the pure generator core (ai/generateFlow) drives.
  private _aiRunModel(serverId: string, opts: { provider?: string; model?: string; api_key?: string }): RunModel {
    const provider = String(opts.provider || 'openai')
    const model = String(opts.model || 'gpt-4o')
    const ctx: Record<string, any> = { _serverId: serverId }
    installVaultAccessors(ctx, serverId)
    const apiKey = String(resolveValue(opts.api_key, ctx) ?? '')
    if (!apiKey) throw new Error('no API key — set api_key, e.g. {{environment.prod.OPENAI_KEY}}')
    const llm = buildModel(provider, model, apiKey)
    return async ({ system, user, schema, onPartial }) => {
      // streamObject so we can push the partial object to the UI as it's built. We
      // throttle onPartial to avoid flooding STATE_DELTA on every token.
      const result = streamObject({ model: llm, schema, system, prompt: user })
      if (onPartial) {
        let last = 0
        for await (const partial of result.partialObjectStream) {
          const now = Date.now()
          if (now - last > 400) { last = now; try { onPartial(partial) } catch { /* ignore */ } }
        }
      }
      return await result.object
    }
  }

  // Generate a brand-new flow from a text prompt (+ optional reference flow). Returns
  // the validated {nodes, edges} for the client to preview/save — NOT persisted here.
  // Push AI-generation progress to the panel via STATE_DELTA (key aiGen:<serverId>).
  // The client watches this instead of awaiting the RPC, so a long (multi-round)
  // generation never trips the WS request timeout.
  private _setAiGen(serverId: string, v: { status: string; phase?: string; flow?: any; name?: string; validation?: any; error?: string; partial?: string }) {
    try { (this as any).setState({ [`aiGen:${serverId}`]: { ...v, at: Date.now() } }) } catch { /* headless */ }
  }

  // Fire-and-forget: returns immediately; the real result arrives via aiGen:<serverId>.
  async generateFlow(payload: {
    server_id: string; prompt: string; reference_flow_id?: string
    provider?: string; model?: string; api_key?: string
  }) {
    const sid = payload?.server_id
    if (!sid || !payload?.prompt?.trim()) return { success: false, error: 'server_id and prompt are required' }
    if (!this.aiEnabled(sid)) return { success: false, error: 'AI flows disabled for this server' }
    console.log(`[DSTP Automation] generateFlow START server=${sid} prompt="${payload.prompt.slice(0, 60)}"`)
    this._setAiGen(sid, { status: 'running', phase: 'generating' })
    ;(async () => {
      try {
        let reference: GenFlow | undefined
        if (payload.reference_flow_id) {
          const ref = this.flowRepo(sid).findById(payload.reference_flow_id)
          if (ref) reference = { nodes: ref.nodes as FlowNode[], edges: ref.edges as FlowEdge[] }
        }
        const runModel = this._aiRunModel(sid, payload)
        const onPartial = (partial: any) => {
          // Push the growing partial so the modal can show the AI's live output.
          const nodes = Array.isArray(partial?.nodes) ? partial.nodes.length : 0
          const edges = Array.isArray(partial?.edges) ? partial.edges.length : 0
          this._setAiGen(sid, { status: 'streaming', phase: `${nodes} nós, ${edges} conexões`, partial: JSON.stringify(partial) } as any)
        }
        const res = await generateFlowFromPrompt(payload.prompt.trim(), runModel, reference, onPartial)
        console.log(`[DSTP Automation] generateFlow DONE server=${sid} ok=${res.ok} nodes=${res.flow?.nodes.length} name="${res.name ?? ''}"`)
        this._setAiGen(sid, { status: 'done', flow: res.flow, name: res.name, validation: res.validation })
      } catch (err: any) {
        console.error('[DSTP Automation] generateFlow ERROR:', err?.message)
        this._setAiGen(sid, { status: 'error', error: err?.message ?? 'generation failed' })
      }
    })()
    return { started: true }
  }

  // Push edit progress on a SEPARATE key (aiEdit:<serverId>) so the editor can watch
  // it independently of the generate flow.
  private _setAiEdit(serverId: string, v: { status: string; phase?: string; flow?: any; validation?: any; error?: string; partial?: string }) {
    try { (this as any).setState({ [`aiEdit:${serverId}`]: { ...v, at: Date.now() } }) } catch { /* headless */ }
  }

  // Fire-and-forget + streaming, like generateFlow. Result arrives via aiEdit:<serverId>.
  async editFlow(payload: {
    server_id: string; prompt: string; current_flow: GenFlow
    provider?: string; model?: string; api_key?: string
  }) {
    const sid = payload?.server_id
    if (!sid || !payload?.prompt?.trim() || !payload?.current_flow) return { success: false, error: 'server_id, prompt and current_flow are required' }
    if (!this.aiEnabled(sid)) return { success: false, error: 'AI flows disabled for this server' }
    this._setAiEdit(sid, { status: 'running', phase: 'editing' })
    ;(async () => {
      try {
        const runModel = this._aiRunModel(sid, payload)
        const onPartial = (partial: any) => {
          const adds = Array.isArray(partial?.addNodes) ? partial.addNodes.length : 0
          const rms = Array.isArray(partial?.removeNodeIds) ? partial.removeNodeIds.length : 0
          this._setAiEdit(sid, { status: 'streaming', phase: `+${adds} nós, -${rms}`, partial: JSON.stringify(partial) })
        }
        const res = await editFlowWithPrompt(payload.prompt.trim(), payload.current_flow, runModel, onPartial)
        this._setAiEdit(sid, { status: 'done', flow: res.flow, validation: res.validation })
      } catch (err: any) {
        console.error('[DSTP Automation] editFlow ERROR:', err?.message)
        this._setAiEdit(sid, { status: 'error', error: err?.message ?? 'edit failed' })
      }
    })()
    return { started: true }
  }

  async deleteFlow(payload: { flow_id: string; server_id: string }) {
    invalidateAnalysis(payload.flow_id)
    WorkflowInstanceStore.getInstance().clearFlow(payload.flow_id)
    // Unload it from the worker core: abort any in-flight runs (a long ai_agent loop)
    // so a deleted flow stops executing instead of finishing its current run.
    serverCoreManager.unloadFlow(payload.server_id, payload.flow_id)
    this.flowRepo(payload.server_id).delete(payload.flow_id)
    this._ensureEngine().collectWatchKeys(payload.server_id)  // shrink watch set if a key flow went away
    this.syncState(payload.server_id)
    return { success: true }
  }

  async toggleFlow(payload: { flow_id: string; server_id: string; enabled: boolean }) {
    if (!payload.enabled) {
      WorkflowInstanceStore.getInstance().clearFlow(payload.flow_id)
      serverCoreManager.unloadFlow(payload.server_id, payload.flow_id)  // abort in-flight runs
    }
    this.flowRepo(payload.server_id).toggle(payload.flow_id, payload.enabled)
    this._ensureEngine().collectWatchKeys(payload.server_id)  // (re)compute after enable/disable
    this.syncState(payload.server_id)
    return { success: true }
  }

  // Move/reorder a flow in the panel list (drag-and-drop). Touches only the
  // folder + order, never nodes/edges. `order` lets a single drag renumber several
  // siblings in one round-trip (one syncState).
  async moveFlow(payload: {
    server_id: string
    flow_id?: string
    folder_path?: string
    sort_order?: number
    order?: Array<{ flow_id: string; folder_path: string; sort_order: number }>
  }) {
    const repo = this.flowRepo(payload.server_id)
    const folders = this.folderRepo(payload.server_id)
    if (Array.isArray(payload.order) && payload.order.length) {
      for (const o of payload.order) { repo.move(o.flow_id, o.folder_path ?? '', o.sort_order ?? 0); if (o.folder_path) folders.create(o.folder_path) }
    } else if (payload.flow_id) {
      repo.move(payload.flow_id, payload.folder_path ?? '', payload.sort_order ?? 0)
      if (payload.folder_path) folders.create(payload.folder_path)
    } else {
      return { success: false, reason: 'no flow_id or order' }
    }
    this.syncState(payload.server_id)
    return { success: true }
  }

  // Create an empty folder (and its ancestors). Lets the panel make a folder
  // before any flow lives in it.
  async createFolder(payload: { server_id: string; path: string }) {
    const path = (payload.path || '').trim()
    if (!path) return { success: false, reason: 'empty path' }
    this.folderRepo(payload.server_id).create(path)
    this.syncState(payload.server_id)
    return { success: true }
  }

  // Delete a folder. Blocked if any flow still lives in it or a subfolder — the
  // user must empty/move those flows first (no accidental flow loss). With
  // `force`, the contained flows are MOVED TO ROOT (never deleted) and then the
  // folder is removed.
  async deleteFolder(payload: { server_id: string; path: string; force?: boolean }) {
    const folders = this.folderRepo(payload.server_id)
    const n = folders.flowCountUnder(payload.path)
    if (n > 0 && !payload.force) return { success: false, reason: 'not_empty', count: n }
    if (n > 0 && payload.force) {
      // Move every flow under this folder out to root, then drop the folder.
      const repo = this.flowRepo(payload.server_id)
      const prefix = payload.path + '/'
      for (const f of repo.findAll()) {
        if (f.folderPath === payload.path || (f.folderPath ?? '').startsWith(prefix)) {
          repo.move(f.id, '', f.sortOrder ?? 0)
        }
      }
    }
    folders.delete(payload.path)
    this.syncState(payload.server_id)
    return { success: true, moved: payload.force ? n : 0 }
  }

  // Reorder a folder among its siblings (drag a folder up/down).
  async reorderFolder(payload: { server_id: string; path: string; sort_order: number }) {
    this.folderRepo(payload.server_id).setOrder(payload.path, payload.sort_order ?? 0)
    this.syncState(payload.server_id)
    return { success: true }
  }

  // Move a folder under a new parent ("" = root), cascading the rename to its
  // subfolders and the flows inside. Rejected if dropped into itself/its subtree.
  async moveFolder(payload: { server_id: string; path: string; new_parent: string; sort_order?: number }) {
    const result = this.folderRepo(payload.server_id).reparent(payload.path, payload.new_parent ?? '', payload.sort_order ?? 0)
    if (result === null) return { success: false, reason: 'into_self' }
    this.syncState(payload.server_id)
    return { success: true, newPath: result }
  }

  // Rename a folder's leaf segment, cascading to subfolders + flows.
  async renameFolder(payload: { server_id: string; path: string; new_name: string }) {
    const result = this.folderRepo(payload.server_id).rename(payload.path, payload.new_name ?? '')
    if (result === null) return { success: false, reason: 'invalid' }
    this.syncState(payload.server_id)
    return { success: true, newPath: result }
  }

  // Enable/disable all flows in a folder (and subfolders) at once.
  async toggleFolder(payload: { server_id: string; path: string; enabled: boolean }) {
    const repo = this.flowRepo(payload.server_id)
    const ids = repo.findAll()
      .filter(f => f.folderPath === payload.path || (f.folderPath ?? '').startsWith(payload.path + '/'))
      .map(f => f.id)
    const n = this.folderRepo(payload.server_id).setEnabledUnder(payload.path, payload.enabled)
    // Mirror toggleFlow's side-effects: clear pending waits + abort in-flight runs for
    // every flow being disabled under this folder.
    if (!payload.enabled) {
      const store = WorkflowInstanceStore.getInstance()
      for (const id of ids) {
        store.clearFlow(id)
        serverCoreManager.unloadFlow(payload.server_id, id)
      }
    }
    this.syncState(payload.server_id)
    return { success: true, count: n }
  }

  async loadFlows(payload: { server_id: string }) {
    this.syncState(payload.server_id)
    return { success: true }
  }

  async clearLogs(payload: { server_id: string }) {
    this.logRepo(payload.server_id).clear()
    this.setState({ [`logs:${payload.server_id}`]: [] } as any)
    return { success: true }
  }

  async getEventSchemas(payload: { server_id: string }) {
    const repo = new EventSchemaRepository(payload.server_id)
    return { schemas: repo.findAll() }
  }

  async exportFlow(payload: { flow_id: string; server_id: string }) {
    const flow = this.flowRepo(payload.server_id).findById(payload.flow_id)
    if (!flow) throw new Error('Flow not found')

    return {
      name: flow.name,
      nodes: flow.nodes,
      edges: flow.edges,
      version: '1.0',
      exportedAt: new Date().toISOString(),
    }
  }

  async importFlow(payload: { flow_json: any; server_id: string }) {
    const { flow_json, server_id } = payload

    if (!flow_json?.name || !Array.isArray(flow_json.nodes) || !Array.isArray(flow_json.edges)) {
      throw new Error('Invalid flow: must have name, nodes, and edges')
    }

    const newFlowId = `flow_${Date.now()}`

    // Build a map from old node IDs to new node IDs
    const idMap = new Map<string, string>()
    for (const node of flow_json.nodes as FlowNode[]) {
      idMap.set(node.id, `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    }

    const newNodes: FlowNode[] = (flow_json.nodes as FlowNode[]).map(node => ({
      ...node,
      id: idMap.get(node.id)!,
    }))

    const newEdges: FlowEdge[] = (flow_json.edges as FlowEdge[]).map(edge => ({
      ...edge,
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    }))

    this.flowRepo(server_id).save({
      id: newFlowId,
      name: flow_json.name,
      enabled: false,
      nodes: newNodes,
      edges: newEdges,
    })

    this.syncState(server_id)

    return {
      flow_id: newFlowId,
      name: flow_json.name,
      nodes: newNodes,
      edges: newEdges,
    }
  }

  // ─── Event Evaluation (delegates to engine) ────────

  evaluateEvent(server_id: string, event: any) {
    this._ensureEngine().evaluateEvent(server_id, event)
  }

  // ─── Capture Mode ──────────────────────────────────
  // Event execution runs inside the per-server worker core, so capture must be
  // toggled THERE (not on the main-thread engine, which never sees the events).
  // The worker emits the trace back via emitState → panelEmit → this component.

  async startCapture(payload: { server_id: string }) {
    serverCoreManager.startCapture(payload.server_id)
  }

  async stopCapture(payload: { server_id: string }) {
    serverCoreManager.stopCapture(payload.server_id)
  }
}
