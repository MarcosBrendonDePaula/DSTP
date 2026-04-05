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

  private executeFlow(flow: Flow, trigger: FlowNode, event: any, serverId: string) {
    const nodes = flow.nodes as FlowNode[]
    const edges = flow.edges as FlowEdge[]
    const executedActions: string[] = []

    const traverse = (nodeId: string, eventData: any) => {
      const outEdges = edges.filter(e => e.source === nodeId)

      for (const edge of outEdges) {
        const target = nodes.find(n => n.id === edge.target)
        if (!target) continue

        if (target.type === 'condition') {
          const result = this.evaluateCondition(target, eventData)
          const shouldFollow = edge.sourceHandle === 'true' ? result
            : edge.sourceHandle === 'false' ? !result
            : result
          if (shouldFollow) traverse(target.id, eventData)
        } else if (target.type === 'action') {
          this.runFlowAction(serverId, target, eventData)
          executedActions.push(target.data.action_type || 'unknown')
        }
      }
    }

    traverse(trigger.id, event.data || {})

    if (executedActions.length > 0) {
      this.flowRepo(serverId).updateStats(flow.id, (flow.triggerCount || 0) + 1)

      this.logRepo(serverId).create({
        flowId: flow.id,
        flowName: flow.name,
        eventType: event.type,
        actions: executedActions,
      })

      this.syncState(serverId)
    }
  }

  private evaluateCondition(node: FlowNode, data: any): boolean {
    const { field, operator, value } = node.data
    if (!field || !operator) return true
    const actual = data[field]

    switch (operator) {
      case 'equals': return String(actual) === String(value)
      case 'not_equals': return String(actual) !== String(value)
      case 'greater_than': return Number(actual) > Number(value)
      case 'less_than': return Number(actual) < Number(value)
      case 'contains': return String(actual).includes(String(value))
      case 'exists': return actual != null
      default: return true
    }
  }

  private runFlowAction(serverId: string, node: FlowNode, eventData: any) {
    const actionType = node.data.action_type
    if (!actionType) return

    const actionData: Record<string, any> = {}
    for (const [key, val] of Object.entries(node.data.params || {})) {
      if (typeof val === 'string' && val.startsWith('{{') && val.endsWith('}}')) {
        actionData[key] = eventData[val.slice(2, -2).trim()] ?? val
      } else {
        actionData[key] = val
      }
    }

    dstStateStore.pushCommandToServer(serverId, actionType, actionData)
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
