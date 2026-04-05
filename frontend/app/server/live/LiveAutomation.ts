// LiveAutomation - Manages automation flows with SQLite persistence
// Evaluates triggers against incoming events, queues actions

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import * as db from '../services/Database'

// ─── Types ───────────────────────────────────────────

interface FlowNode {
  id: string
  type: 'trigger' | 'condition' | 'action'
  data: Record<string, any>
  position: { x: number; y: number }
}

interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

interface Flow {
  id: string
  name: string
  enabled: boolean
  server_id: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  created_at: number
  last_triggered?: number
  trigger_count: number
}

interface AutomationState {
  flows: Flow[]
  logs: Array<{ flow_id: string; flow_name: string; event_type: string; actions: string[]; timestamp: number }>
}

// ─── Singleton ───────────────────────────────────────

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

  declare flows: Flow[]
  declare logs: AutomationState['logs']

  protected onMount() {
    _automationInstance = this
  }

  protected onDestroy() {
    if (_automationInstance === this) _automationInstance = null
  }

  // ─── Flow CRUD (persisted to SQLite) ───────────────

  async saveFlow(payload: { flow: Flow }) {
    const { flow } = payload
    if (!flow || !flow.id || !flow.server_id) throw new Error('flow with id and server_id required')

    db.saveFlow(flow.server_id, flow)
    this.ensureEventCategories(flow)

    // Reload from DB
    return this.loadFlows({ server_id: flow.server_id })
  }

  async deleteFlow(payload: { flow_id: string; server_id: string }) {
    db.deleteFlow(payload.server_id, payload.flow_id)
    return this.loadFlows({ server_id: payload.server_id })
  }

  async toggleFlow(payload: { flow_id: string; server_id: string; enabled: boolean }) {
    db.toggleFlow(payload.server_id, payload.flow_id, payload.enabled)
    return this.loadFlows({ server_id: payload.server_id })
  }

  async loadFlows(payload: { server_id: string }) {
    const flows = db.getFlows(payload.server_id)
    const logs = db.getAutomationLogs(payload.server_id)
    this.setState({ flows, logs })
    return { success: true, flows, logs }
  }

  async clearLogs(payload: { server_id: string }) {
    db.clearAutomationLogs(payload.server_id)
    this.setState({ logs: [] })
    return { success: true }
  }

  // ─── Event Evaluation ──────────────────────────────

  evaluateEvent(server_id: string, event: any) {
    // Load flows from DB (cached in state, but re-read for fresh enabled state)
    const flows = db.getFlows(server_id)

    for (const flow of flows) {
      if (!flow.enabled) continue

      const triggers = flow.nodes.filter((n: FlowNode) => n.type === 'trigger')
      for (const trigger of triggers) {
        if (this.matchesTrigger(trigger, event)) {
          this.executeFlow(flow, trigger, event, server_id)
        }
      }
    }
  }

  private matchesTrigger(trigger: FlowNode, event: any): boolean {
    return trigger.data.event_type === event.type
  }

  private executeFlow(flow: Flow, trigger: FlowNode, event: any, server_id: string) {
    const executedActions: string[] = []

    const traverse = (nodeId: string, eventData: any) => {
      const outEdges = flow.edges.filter((e: FlowEdge) => e.source === nodeId)

      for (const edge of outEdges) {
        const targetNode = flow.nodes.find((n: FlowNode) => n.id === edge.target)
        if (!targetNode) continue

        if (targetNode.type === 'condition') {
          const result = this.evaluateCondition(targetNode, eventData)
          // Only follow the edge matching the condition result
          if (edge.sourceHandle === 'true' && result) {
            traverse(targetNode.id, eventData)
          } else if (edge.sourceHandle === 'false' && !result) {
            traverse(targetNode.id, eventData)
          } else if (!edge.sourceHandle) {
            // No handle specified — follow if true
            if (result) traverse(targetNode.id, eventData)
          }
        } else if (targetNode.type === 'action') {
          this.runAction(server_id, targetNode, eventData)
          executedActions.push(targetNode.data.action_type || 'unknown')
        }
      }
    }

    traverse(trigger.id, event.data || {})

    if (executedActions.length > 0) {
      // Update stats in DB
      db.updateFlowStats(server_id, flow.id, (flow.trigger_count || 0) + 1, Date.now())

      // Log
      db.addAutomationLog(server_id, {
        flow_id: flow.id,
        flow_name: flow.name,
        event_type: event.type,
        actions: executedActions,
      })

      // Update live state
      const updatedFlows = db.getFlows(server_id)
      const updatedLogs = db.getAutomationLogs(server_id)
      this.setState({ flows: updatedFlows, logs: updatedLogs })
    }
  }

  private evaluateCondition(node: FlowNode, eventData: any): boolean {
    const { field, operator, value } = node.data
    if (!field || !operator) return true

    const actual = eventData[field]

    switch (operator) {
      case 'equals': return String(actual) === String(value)
      case 'not_equals': return String(actual) !== String(value)
      case 'greater_than': return Number(actual) > Number(value)
      case 'less_than': return Number(actual) < Number(value)
      case 'contains': return String(actual).includes(String(value))
      case 'exists': return actual !== undefined && actual !== null
      default: return true
    }
  }

  private runAction(server_id: string, node: FlowNode, eventData: any) {
    const actionType = node.data.action_type
    if (!actionType) return

    // Build action data, replacing {{variables}} with event data
    const actionData: Record<string, any> = {}
    for (const [key, val] of Object.entries(node.data.params || {})) {
      if (typeof val === 'string' && val.startsWith('{{') && val.endsWith('}}')) {
        const varName = val.slice(2, -2).trim()
        actionData[key] = eventData[varName] ?? val
      } else {
        actionData[key] = val
      }
    }

    dstStateStore.pushCommandToServer(server_id, actionType, actionData)
  }

  // ─── Auto-enable event categories ──────────────────

  private ensureEventCategories(flow: Flow) {
    const triggerEventTypes = flow.nodes
      .filter((n: FlowNode) => n.type === 'trigger')
      .map((n: FlowNode) => n.data.event_type)

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
    for (const evt of triggerEventTypes) {
      const cat = categoryMap[evt]
      if (cat) needed.add(cat)
    }

    for (const cat of needed) {
      dstStateStore.requestEventToggleForServer(flow.server_id, cat, true)
    }
  }
}
