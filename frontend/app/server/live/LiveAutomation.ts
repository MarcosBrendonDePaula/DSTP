// LiveAutomation - Manages automation flows with Drizzle ORM + SQLite

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import { FlowRepository, AutomationLogRepository, EventSchemaRepository, type FlowNode, type FlowEdge, type Flow } from '../db'

// ─── State ──────��────────────────────────────────────

interface AutomationState {
  flows: any[]
  logs: any[]
}

let _automationInstance: LiveAutomation | null = null

// Ensure a usable instance always exists for event processing
function _getOrCreateInstance(): LiveAutomation {
  if (!_automationInstance) {
    // Create a headless instance that works without Live Component clients
    _automationInstance = Object.create(LiveAutomation.prototype) as LiveAutomation
    ;(_automationInstance as any).state = LiveAutomation.defaultState
    ;(_automationInstance as any).setState = function(delta: any) {
      Object.assign(this.state, delta)
    }
    ;(_automationInstance as any)._captureServerId = null
    ;(_automationInstance as any)._captureTrace = []
  }
  return _automationInstance
}

export function processAutomationEvent(server_id: string, event: any) {
  _getOrCreateInstance().evaluateEvent(server_id, event)
}

// ─── Component ───────────────────────────────────────

export class LiveAutomation extends LiveComponent<AutomationState> {
  static componentName = 'LiveAutomation'
  static singleton = true
  static publicActions = [
    'saveFlow',
    'deleteFlow',
    'toggleFlow',
    'loadFlows',
    'clearLogs',
    'getEventSchemas',
    'exportFlow',
    'importFlow',
    'startCapture',
    'stopCapture',
  ] as const

  // Capture mode — when active, execution traces are collected and emitted at the end
  private _captureServerId: string | null = null
  private _captureTrace: Array<{ nodeId: string; status: string; input: Record<string, any>; output: any; error?: string; timestamp: number }> = []

  static defaultState: AutomationState = {
    flows: [],
    logs: [],
  }

  protected onMount() {
    _automationInstance = this
  }

  protected onDestroy() {
    if (_automationInstance === this) _automationInstance = null
  }

  // ─── Helpers ───────────────────────────────────────

  private flowRepo(serverId: string) { return new FlowRepository(serverId) }
  private logRepo(serverId: string) { return new AutomationLogRepository(serverId) }

  private syncState(serverId: string) {
    const flows = this.flowRepo(serverId).findAll()
    const logs = this.logRepo(serverId).findRecent()
    console.log(`[DSTP Automation] syncState(${serverId}): ${flows.length} flows, ${logs.length} logs`)
    this.setState({ [`flows:${serverId}`]: flows, [`logs:${serverId}`]: logs } as any)
  }

  // ─── Flow CRUD ─────────────────────────────────────

  async saveFlow(payload: { flow: any }) {
    const { flow } = payload
    if (!flow?.id || !flow?.server_id) throw new Error('flow with id and server_id required')

    this.flowRepo(flow.server_id).save({
      id: flow.id,
      name: flow.name,
      enabled: flow.enabled ?? true,
      nodes: flow.nodes || [],
      edges: flow.edges || [],
    })

    this.ensureEventCategories(flow)
    this.syncState(flow.server_id)
    return { success: true }
  }

  async deleteFlow(payload: { flow_id: string; server_id: string }) {
    this.flowRepo(payload.server_id).delete(payload.flow_id)
    this.syncState(payload.server_id)
    return { success: true }
  }

  async toggleFlow(payload: { flow_id: string; server_id: string; enabled: boolean }) {
    this.flowRepo(payload.server_id).toggle(payload.flow_id, payload.enabled)
    this.syncState(payload.server_id)
    return { success: true }
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

  // ─── Event Evaluation ──────────────────────────────

  evaluateEvent(server_id: string, event: any) {
    const flows = this.flowRepo(server_id).findEnabled()

    for (const flow of flows) {
      const triggers = (flow.nodes as FlowNode[]).filter(n => n.type === 'trigger')
      for (const trigger of triggers) {
        if (trigger.data.event_type === event.type) {
          this.executeFlow(flow, trigger, event, server_id)
        }
      }
    }
  }

  // ─── Capture Mode ──────────────────────────────────

  async startCapture(payload: { server_id: string }) {
    this._captureServerId = payload.server_id
    this._captureTrace = []
    this.setState({ [`capture:${payload.server_id}`]: { active: true } } as any)
  }

  async stopCapture(payload: { server_id: string }) {
    this._captureServerId = null
    this._captureTrace = []
    this.setState({ [`capture:${payload.server_id}`]: null } as any)
  }

  private pushTrace(serverId: string, nodeId: string, status: string, input: Record<string, any>, output: any, error?: string) {
    if (this._captureServerId !== serverId) return
    this._captureTrace.push({
      nodeId,
      status,
      input: { ...input },
      output,
      error,
      timestamp: Date.now(),
    })
  }

  // ─── Flow Execution with Context ────────────────────
  // Each node registers its output in context[node_id]
  // Downstream nodes can reference via {{node_id.field}}
  // Context is linear: A->B->C means C sees A and B, but A doesn't see B

  private async executeFlow(flow: Flow, trigger: FlowNode, event: any, serverId: string) {
    const nodes = flow.nodes as FlowNode[]
    const edges = flow.edges as FlowEdge[]
    const executedActions: string[] = []

    // Execution context — each node registers output here
    // Also register aliases so {{myAlias.field}} works alongside {{node_id.field}}
    const context: Record<string, any> = {
      trigger: { ...event.data, _event_type: event.type, _timestamp: Date.now() },
    }

    // Build alias map: alias -> node_id (from node.data.alias)
    const aliasMap = new Map<string, string>()
    for (const n of nodes) {
      if (n.data.alias && typeof n.data.alias === 'string') {
        aliasMap.set(n.data.alias, n.id)
      }
    }

    // Helper: register node output in context by both id and alias
    const setContext = (nodeId: string, value: any) => {
      context[nodeId] = value
      const node = nodes.find(n => n.id === nodeId)
      if (node?.data.alias) {
        context[node.data.alias] = value
      }
    }

    // Record trigger in trace (if capturing)
    this.pushTrace(serverId, trigger.id, 'completed', {}, context.trigger)

    const processNode = async (node: FlowNode) => {
      const inputSnapshot = { ...context }

      try {
        if (node.type === 'condition') {
          const result = this.evaluateCondition(node, context)
          setContext(node.id, { result, field: node.data.field, value: node.data.value })
          this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])

          // Traverse the condition's OWN outgoing edges, checking their sourceHandle
          const conditionOutEdges = edges.filter(e => e.source === node.id)
          for (const condEdge of conditionOutEdges) {
            const shouldFollow = condEdge.sourceHandle === 'true' ? result
              : condEdge.sourceHandle === 'false' ? !result
              : result
            if (shouldFollow) {
              const nextNode = nodes.find(n => n.id === condEdge.target)
              if (nextNode) await processNode(nextNode)
            }
          }

        } else if (node.type === 'delay') {
          const ms = Number(this.resolveValue(node.data.params?.delay_ms || node.data.delay_ms || '1000', context))
          setContext(node.id, { delayed: true, ms })
          await new Promise(resolve => setTimeout(resolve, ms))
          this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])

          const outEdges = edges.filter(e => e.source === node.id)
          for (const edge of outEdges) {
            const nextNode = nodes.find(n => n.id === edge.target)
            if (nextNode) await processNode(nextNode)
          }

        } else if (['action', 'http_request', 'set_variable', 'script'].includes(node.type)) {
          const actionType = node.data.action_type || node.type

          if (actionType === 'http_request') {
            setContext(node.id, await this.executeHttpRequest(node, context))
          } else if (actionType === 'set_variable') {
            setContext(node.id, this.executeSetVariable(node, context))
          } else if (actionType === 'script') {
            setContext(node.id, await this.executeScript(node, context))
          } else {
            this.runFlowAction(serverId, node, context)
            setContext(node.id, { executed: true, action: actionType })
          }

          this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])
          executedActions.push(actionType)

          // Continue traversing this node's outgoing edges
          const outEdges = edges.filter(e => e.source === node.id)
          for (const edge of outEdges) {
            const nextNode = nodes.find(n => n.id === edge.target)
            if (nextNode) await processNode(nextNode)
          }
        }
      } catch (nodeErr: any) {
        this.pushTrace(serverId, node.id, 'error', inputSnapshot, null, nodeErr.message)
        throw nodeErr
      }
    }

    const traverse = async (nodeId: string) => {
      const outEdges = edges.filter(e => e.source === nodeId)

      for (const edge of outEdges) {
        const target = nodes.find(n => n.id === edge.target)
        if (!target) continue
        await processNode(target)
      }
    }

    try {
      await traverse(trigger.id)
    } catch (err) {
      console.error(`[DSTP Automation] Flow "${flow.name}" error:`, err)
    }

    // If capturing, emit the complete trace and stop capture
    if (this._captureServerId === serverId) {
      this.setState({ [`capture:${serverId}`]: {
        active: false,
        flowId: flow.id,
        trace: this._captureTrace,
        context,
      }} as any)
      this._captureServerId = null
      this._captureTrace = []
    }

    // Always log and update stats
    this.flowRepo(serverId).updateStats(flow.id, (flow.triggerCount || 0) + 1)

    this.logRepo(serverId).create({
      flowId: flow.id,
      flowName: flow.name,
      eventType: event.type,
      actions: executedActions,
      context,
    })

    this.syncState(serverId)
  }

  // ─── Resolve template variables from context ───────
  // Supports: {{trigger.name}}, {{node_id.field}}, {{node_id.body.key}}, plain values

  private resolveValue(template: any, context: Record<string, any>): any {
    if (typeof template !== 'string') return template
    if (!template.includes('{{')) return template

    // If the entire string is a single {{path}} with no surrounding text, return the raw value
    const singleMatch = template.match(/^\{\{([^}]+)\}\}$/)
    if (singleMatch) {
      const parts = singleMatch[1].trim().split('.')
      let value: any = context
      for (const part of parts) {
        if (value == null) return template
        value = value[part]
      }
      return value ?? template
    }

    // Otherwise, replace all {{...}} with stringified values
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const parts = path.trim().split('.')
      let value: any = context

      for (const part of parts) {
        if (value == null) return match
        value = value[part]
      }

      return value ?? match
    })
  }

  // ─── Condition evaluator ───────────────────────────

  private evaluateCondition(node: FlowNode, context: Record<string, any>): boolean {
    const { field, operator, value } = node.data
    if (!field || !operator) return true

    // Resolve field — can be a context path like "trigger.prefab" or plain "prefab"
    let actual: any
    if (field.includes('.')) {
      actual = this.resolveValue(`{{${field}}}`, context)
    } else {
      // Try trigger data first, then full context
      actual = context.trigger?.[field] ?? this.resolveValue(`{{${field}}}`, context)
    }

    const resolvedValue = this.resolveValue(value, context)

    switch (operator) {
      case 'equals': return String(actual) === String(resolvedValue)
      case 'not_equals': return String(actual) !== String(resolvedValue)
      case 'greater_than': return Number(actual) > Number(resolvedValue)
      case 'less_than': return Number(actual) < Number(resolvedValue)
      case 'contains': return String(actual).includes(String(resolvedValue))
      case 'exists': return actual != null
      default: return true
    }
  }

  // ─── Game action executor ──────────────────────────

  private runFlowAction(serverId: string, node: FlowNode, context: Record<string, any>) {
    const actionType = node.data.action_type
    if (!actionType) return

    const actionData: Record<string, any> = {}
    for (const [key, val] of Object.entries(node.data.params || {})) {
      actionData[key] = this.resolveValue(val, context)
    }

    dstStateStore.pushCommandToServer(serverId, actionType, actionData)
  }

  // ─── HTTP Request node ─────────────────────────────

  private async executeHttpRequest(node: FlowNode, context: Record<string, any>): Promise<any> {
    const { url, method, headers, body } = node.data.params || {}

    const resolvedUrl = this.resolveValue(url, context)
    const resolvedMethod = (method || 'GET').toUpperCase()

    if (!resolvedUrl) return { error: 'no url', status: 0 }

    try {
      const fetchOptions: RequestInit = {
        method: resolvedMethod,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }

      // Parse custom headers
      if (headers) {
        const resolvedHeaders = this.resolveValue(headers, context)
        try {
          const parsed = typeof resolvedHeaders === 'string' ? JSON.parse(resolvedHeaders) : resolvedHeaders
          Object.assign(fetchOptions.headers!, parsed)
        } catch { /* ignore bad headers */ }
      }

      // Body for POST/PUT
      if (body && resolvedMethod !== 'GET') {
        const resolvedBody = this.resolveValue(body, context)
        fetchOptions.body = typeof resolvedBody === 'string' ? resolvedBody : JSON.stringify(resolvedBody)
      }

      const response = await fetch(resolvedUrl, fetchOptions)
      const text = await response.text()

      let responseBody: any = text
      try { responseBody = JSON.parse(text) } catch { /* keep as text */ }

      return {
        status: response.status,
        ok: response.ok,
        body: responseBody,
      }
    } catch (err: any) {
      return {
        error: err.message || 'fetch failed',
        status: 0,
        ok: false,
      }
    }
  }

  // ─── Set Variable node ─────────────────────────────

  private executeSetVariable(node: FlowNode, context: Record<string, any>): any {
    const result: Record<string, any> = {}
    for (const [key, val] of Object.entries(node.data.params || {})) {
      result[key] = this.resolveValue(val, context)
    }
    return result
  }

  // ─── Script node executor ───────────────────────────
  // SECURITY WARNING: new Function() allows arbitrary code execution (RCE).
  // This is intentional for admin-only server automation scripts, but the code
  // runs in the same Node.js process with full access to the server environment.
  // Do NOT expose this to untrusted users. Future improvement: use vm2 or
  // isolated-vm for sandboxed execution.

  private async executeScript(node: FlowNode, context: Record<string, any>): Promise<any> {
    const code = node.data.params?.code
    if (!code) return { error: 'no code' }

    try {
      // Wrap user code in an async function that receives context
      // The user defines `async function run(context) { ... }`
      // We extract and call it
      const wrappedCode = `
        ${code}
        return typeof run === 'function' ? run(context) : { error: 'no run() function defined' }
      `

      const fn = new Function('context', 'fetch', wrappedCode)
      const result = await fn(context, fetch)

      return result ?? { executed: true }
    } catch (err: any) {
      console.error(`[DSTP Script] Error:`, err.message)
      return { error: err.message }
    }
  }

  // ─── Auto-enable event categories ──────────────────

  private ensureEventCategories(flow: any) {
    const categoryMap: Record<string, string> = {
      player_spawn: 'players', player_left: 'players', player_death: 'players',
      player_ghost: 'players', player_respawn: 'players',
      chat_message: 'chat',
      new_day: 'world', phase_changed: 'world', season_changed: 'world',
      player_kill: 'combat', player_attacked: 'combat',
      player_craft: 'crafting', player_build: 'crafting',
      player_equip: 'inventory', player_pickup: 'inventory', player_drop: 'inventory', player_unequip: 'inventory',
      storm_changed: 'weather', precipitation: 'weather', lightning_strike: 'weather',
      boss_event: 'bosses', boss_killed: 'bosses', fire_started: 'bosses',
      player_eat: 'survival', player_insane: 'survival', player_sane: 'survival',
      player_starving: 'survival', player_fed: 'survival',
      player_freezing: 'survival', player_cooled: 'survival',
      player_overheating: 'survival', player_warm: 'survival',
      player_mounted: 'survival', player_dismounted: 'survival',
      player_work: 'gathering', resource_gathered: 'gathering', player_harvest: 'gathering', player_startfire: 'gathering',
      health_delta: 'health', hunger_delta: 'health', sanity_delta: 'health',
    }

    const needed = new Set<string>()
    for (const node of flow.nodes || []) {
      if (node.type === 'trigger' && categoryMap[node.data.event_type]) {
        needed.add(categoryMap[node.data.event_type])
      }
    }

    for (const cat of needed) {
      dstStateStore.requestEventToggleForServer(flow.server_id, cat, true)
    }
  }
}
