// LiveAutomation - Manages automation flows
// Stores flows, evaluates triggers against incoming events, queues actions

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'

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

const FLOWS_KEY = '__dstp_automation_flows__'
if (!(globalThis as any)[FLOWS_KEY]) {
  (globalThis as any)[FLOWS_KEY] = [] as Flow[]
}
const persistedFlows: Flow[] = (globalThis as any)[FLOWS_KEY]

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
    'getFlows',
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
    // Load persisted flows
    this.setState({ flows: persistedFlows })
  }

  protected onDestroy() {
    if (_automationInstance === this) _automationInstance = null
  }

  // ─── Flow CRUD ─────────────────────────────────────

  async saveFlow(payload: { flow: Flow }) {
    const { flow } = payload
    if (!flow || !flow.id) throw new Error('flow with id required')

    const flows = [...this.state.flows]
    const idx = flows.findIndex(f => f.id === flow.id)

    if (idx >= 0) {
      flows[idx] = { ...flow, trigger_count: flows[idx].trigger_count }
    } else {
      flows.push({ ...flow, created_at: Date.now(), trigger_count: 0 })
    }

    // Persist
    persistedFlows.length = 0
    persistedFlows.push(...flows)

    this.setState({ flows })

    // Auto-enable required event categories
    this.ensureEventCategories(flow)

    return { success: true }
  }

  async deleteFlow(payload: { flow_id: string }) {
    const flows = this.state.flows.filter(f => f.id !== payload.flow_id)
    persistedFlows.length = 0
    persistedFlows.push(...flows)
    this.setState({ flows })
    return { success: true }
  }

  async toggleFlow(payload: { flow_id: string; enabled: boolean }) {
    const flows = this.state.flows.map(f =>
      f.id === payload.flow_id ? { ...f, enabled: payload.enabled } : f
    )
    persistedFlows.length = 0
    persistedFlows.push(...flows)
    this.setState({ flows })
    return { success: true }
  }

  async getFlows() {
    return { flows: this.state.flows }
  }

  async clearLogs() {
    this.setState({ logs: [] })
    return { success: true }
  }

  // ─── Event Evaluation ──────────────────────────────

  evaluateEvent(server_id: string, event: any) {
    for (const flow of this.state.flows) {
      if (!flow.enabled || flow.server_id !== server_id) continue

      // Find trigger nodes
      const triggers = flow.nodes.filter(n => n.type === 'trigger')
      for (const trigger of triggers) {
        if (this.matchesTrigger(trigger, event)) {
          this.executeFlow(flow, trigger, event)
        }
      }
    }
  }

  private matchesTrigger(trigger: FlowNode, event: any): boolean {
    const eventType = trigger.data.event_type
    if (!eventType) return false
    return event.type === eventType
  }

  private executeFlow(flow: Flow, trigger: FlowNode, event: any) {
    // Walk the graph from trigger through conditions to actions
    const executedActions: string[] = []

    const traverse = (nodeId: string, eventData: any) => {
      const outEdges = flow.edges.filter(e => e.source === nodeId)

      for (const edge of outEdges) {
        const targetNode = flow.nodes.find(n => n.id === edge.target)
        if (!targetNode) continue

        if (targetNode.type === 'condition') {
          if (this.evaluateCondition(targetNode, eventData)) {
            traverse(targetNode.id, eventData)
          }
        } else if (targetNode.type === 'action') {
          this.runAction(flow.server_id, targetNode, eventData)
          executedActions.push(targetNode.data.action_type || 'unknown')
        }
      }
    }

    traverse(trigger.id, event.data || {})

    // Update flow stats
    const flows = this.state.flows.map(f =>
      f.id === flow.id ? { ...f, last_triggered: Date.now(), trigger_count: f.trigger_count + 1 } : f
    )
    persistedFlows.length = 0
    persistedFlows.push(...flows)

    // Log
    const logs = [...this.state.logs, {
      flow_id: flow.id,
      flow_name: flow.name,
      event_type: event.type,
      actions: executedActions,
      timestamp: Date.now(),
    }].slice(-100)

    this.setState({ flows, logs })
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

    // Send to all shards of this server
    dstStateStore.pushCommandToServer(server_id, actionType, actionData)
  }

  // ─── Auto-enable event categories ──────────────────

  private ensureEventCategories(flow: Flow) {
    const triggerEventTypes = flow.nodes
      .filter(n => n.type === 'trigger')
      .map(n => n.data.event_type)

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

    // Request activation for needed categories
    for (const cat of needed) {
      dstStateStore.requestEventToggleForServer(flow.server_id, cat, true)
    }
  }
}
