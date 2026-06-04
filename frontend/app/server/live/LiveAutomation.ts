// LiveAutomation - Manages automation flows with Drizzle ORM + SQLite
//
// This is the LiveComponent (UI actions: flow CRUD, capture, etc). The actual
// flow execution motor lives in FlowEngine.ts and is driven here via an
// injectable "host". LiveAutomation supplies a "direct host" that wires the
// engine to dstStateStore (commands / player groups / event toggles) and to
// this.setState (STATE_DELTA to the panel).

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import { FlowRepository, FolderRepository, AutomationLogRepository, EventSchemaRepository, type FlowNode, type FlowEdge } from '../db'
import { invalidateAnalysis } from './FlowAnalyzer'
import { WorkflowInstanceStore } from './WorkflowInstanceStore'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { serverCoreManager, setPanelEmitter } from './ServerCoreManager'

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
    this.syncState(flow.server_id)
    return { success: true }
  }

  async deleteFlow(payload: { flow_id: string; server_id: string }) {
    invalidateAnalysis(payload.flow_id)
    WorkflowInstanceStore.getInstance().clearFlow(payload.flow_id)
    this.flowRepo(payload.server_id).delete(payload.flow_id)
    this.syncState(payload.server_id)
    return { success: true }
  }

  async toggleFlow(payload: { flow_id: string; server_id: string; enabled: boolean }) {
    if (!payload.enabled) {
      WorkflowInstanceStore.getInstance().clearFlow(payload.flow_id)
    }
    this.flowRepo(payload.server_id).toggle(payload.flow_id, payload.enabled)
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
  // user must empty/move those flows first (no accidental flow loss).
  async deleteFolder(payload: { server_id: string; path: string }) {
    const repo = this.folderRepo(payload.server_id)
    const n = repo.flowCountUnder(payload.path)
    if (n > 0) return { success: false, reason: 'not_empty', count: n }
    repo.delete(payload.path)
    this.syncState(payload.server_id)
    return { success: true }
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
    // Mirror toggleFlow's side-effects: clear pending waits for flows being disabled.
    if (!payload.enabled) {
      const store = WorkflowInstanceStore.getInstance()
      for (const id of ids) store.clearFlow(id)
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
