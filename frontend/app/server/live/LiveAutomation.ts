// LiveAutomation - Manages automation flows with Drizzle ORM + SQLite

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import { FlowRepository, AutomationLogRepository, type FlowNode, type FlowEdge, type Flow } from '../db'

// ─── State ──────��────────────────────────────────────

interface AutomationState {
  flows: any[]
  logs: any[]
}

let _automationInstance: LiveAutomation | null = null

export function processAutomationEvent(server_id: string, event: any) {
  _automationInstance?.evaluateEvent(server_id, event)
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
  ] as const

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
    this.setState({ flows, logs })
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
    this.setState({ logs: [] })
    return { success: true }
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

  // ─── Flow Execution with Context ────────────────────
  // Each node registers its output in context[node_id]
  // Downstream nodes can reference via {{node_id.field}}
  // Context is linear: A->B->C means C sees A and B, but A doesn't see B

  private async executeFlow(flow: Flow, trigger: FlowNode, event: any, serverId: string) {
    const nodes = flow.nodes as FlowNode[]
    const edges = flow.edges as FlowEdge[]
    const executedActions: string[] = []

    // Execution context — each node registers output here
    const context: Record<string, any> = {
      trigger: { ...event.data, _event_type: event.type, _timestamp: Date.now() },
    }

    const traverse = async (nodeId: string) => {
      const outEdges = edges.filter(e => e.source === nodeId)

      for (const edge of outEdges) {
        const target = nodes.find(n => n.id === edge.target)
        if (!target) continue

        if (target.type === 'condition') {
          const result = this.evaluateCondition(target, context)
          context[target.id] = { result, field: target.data.field, value: target.data.value }

          const shouldFollow = edge.sourceHandle === 'true' ? result
            : edge.sourceHandle === 'false' ? !result
            : result
          if (shouldFollow) await traverse(target.id)

        } else if (target.type === 'action') {
          if (target.data.action_type === 'http_request') {
            const result = await this.executeHttpRequest(target, context)
            context[target.id] = result
          } else if (target.data.action_type === 'set_variable') {
            const result = this.executeSetVariable(target, context)
            context[target.id] = result
          } else {
            this.runFlowAction(serverId, target, context)
            context[target.id] = { executed: true, action: target.data.action_type }
          }
          executedActions.push(target.data.action_type || 'unknown')
          await traverse(target.id)
        }
      }
    }

    try {
      await traverse(trigger.id)
    } catch (err) {
      console.error(`[DSTP Automation] Flow "${flow.name}" error:`, err)
    }

    // Always log and update stats
    this.flowRepo(serverId).updateStats(flow.id, (flow.triggerCount || 0) + 1)

    this.logRepo(serverId).create({
      flowId: flow.id,
      flowName: flow.name,
      eventType: event.type,
      actions: executedActions,
    })

    this.syncState(serverId)
  }

  // ─── Resolve template variables from context ───────
  // Supports: {{trigger.name}}, {{node_id.field}}, {{node_id.body.key}}, plain values

  private resolveValue(template: any, context: Record<string, any>): any {
    if (typeof template !== 'string') return template
    if (!template.includes('{{')) return template

    // Replace all {{...}} in the string
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

  // ─── Auto-enable event categories ──────────────────

  private ensureEventCategories(flow: any) {
    const categoryMap: Record<string, string> = {
      player_spawn: 'players', player_left: 'players', player_death: 'players',
      player_ghost: 'players', player_respawn: 'players',
      chat_message: 'chat',
      new_day: 'world', phase_changed: 'world', season_changed: 'world',
      player_kill: 'combat', player_attacked: 'combat',
      player_craft: 'crafting', player_build: 'crafting',
      player_equip: 'inventory', player_pickup: 'inventory', player_drop: 'inventory',
      storm_changed: 'weather', precipitation: 'weather',
      boss_event: 'bosses', boss_killed: 'bosses',
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
