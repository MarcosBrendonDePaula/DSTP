// LiveAutomation - Manages automation flows with Drizzle ORM + SQLite

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import { FlowRepository, AutomationLogRepository, EventSchemaRepository, FlowMemoryRepository, type FlowNode, type FlowEdge, type Flow } from '../db'
import { getAnalysis, invalidateAnalysis, type FlowAnalysis } from './FlowAnalyzer'
import { WorkflowInstanceStore } from './WorkflowInstanceStore'

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

  // Shared storage between flows — Script nodes can read/write via context.store
  private static _flowStorage: Record<string, Record<string, any>> = {}

  static getStore(serverId: string): Record<string, any> {
    if (!this._flowStorage[serverId]) this._flowStorage[serverId] = {}
    return this._flowStorage[serverId]
  }

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

    invalidateAnalysis(flow.id)
    this.ensureEventCategories(flow)
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
          const analysis = getAnalysis(flow.id, { nodes: flow.nodes as FlowNode[], edges: flow.edges as FlowEdge[] })
          if (analysis.isSimple) {
            this.executeFlow(flow, trigger, event, server_id)
          } else {
            this.executeStatefulBranch(flow, trigger, event, server_id, analysis)
          }
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

  // ─── Shared Node Processor ──────────────────────────
  // Used by both simple executeFlow and stateful branch execution.
  // Returns 'wait' if a wait node was encountered (stateful only uses stopAtWait=true).

  private async processNode(
    node: FlowNode,
    nodes: FlowNode[],
    edges: FlowEdge[],
    context: Record<string, any>,
    serverId: string,
    executedActions: string[],
    setContext: (nodeId: string, value: any) => void,
    stopAtWait: boolean = false,
  ): Promise<FlowNode | null> {
    // If this is a wait node and we should stop, return it
    if (node.type === 'wait' && stopAtWait) return node

    const inputSnapshot = { ...context }

    try {
      if (node.type === 'wait') {
        // In simple flow mode (stopAtWait=false), wait nodes just pass through
        setContext(node.id, { waited: true, passthrough: true })
        this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])

        const outEdges = edges.filter(e => e.source === node.id)
        for (const edge of outEdges) {
          const nextNode = nodes.find(n => n.id === edge.target)
          if (nextNode) {
            const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
            if (waitResult) return waitResult
          }
        }
      } else if (node.type === 'condition') {
        const result = this.evaluateCondition(node, context)
        setContext(node.id, { result, field: node.data.field, value: node.data.value })
        this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])

        const conditionOutEdges = edges.filter(e => e.source === node.id)
        for (const condEdge of conditionOutEdges) {
          const shouldFollow = condEdge.sourceHandle === 'true' ? result
            : condEdge.sourceHandle === 'false' ? !result
            : result
          if (shouldFollow) {
            const nextNode = nodes.find(n => n.id === condEdge.target)
            if (nextNode) {
              const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
              if (waitResult) return waitResult
            }
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
          if (nextNode) {
            const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
            if (waitResult) return waitResult
          }
        }

      } else if (node.type === 'get_player') {
        const userid = this.resolveValue(node.data.params?.userid || node.data.userid, context)
        if (userid) {
          const groups = dstStateStore.getServerGroups()
          let playerData: any = null
          for (const g of groups) {
            if (g.server_id === serverId) {
              playerData = g.all_players.find((p: any) => p.userid === userid)
              if (playerData) break
            }
          }
          setContext(node.id, playerData || { error: 'player not found', userid })
        } else {
          setContext(node.id, { error: 'no userid provided' })
        }

        this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])

        const outEdges = edges.filter(e => e.source === node.id)
        for (const edge of outEdges) {
          const nextNode = nodes.find(n => n.id === edge.target)
          if (nextNode) {
            const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
            if (waitResult) return waitResult
          }
        }

      } else if (node.type === 'find_player') {
        let searchName = String(this.resolveValue(node.data.params?.name || node.data.name, context) || '')
        searchName = searchName.replace(/^[\/\\#!\.]\w+\s+/, '').trim()
        if (searchName) {
          const groups = dstStateStore.getServerGroups()
          let playerData: any = null
          for (const g of groups) {
            if (g.server_id === serverId) {
              playerData = g.all_players.find((p: any) =>
                p.name && p.name.toLowerCase().includes(searchName.toLowerCase())
              )
              if (playerData) break
            }
          }
          setContext(node.id, playerData || { error: 'player not found', search: searchName })
        } else {
          setContext(node.id, { error: 'no name provided' })
        }

        this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])

        const outEdges = edges.filter(e => e.source === node.id)
        for (const edge of outEdges) {
          const nextNode = nodes.find(n => n.id === edge.target)
          if (nextNode) {
            const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
            if (waitResult) return waitResult
          }
        }

      } else if (node.type === 'memory') {
        const memRepo = new FlowMemoryRepository(serverId)
        const flowId = context._flowId || ''
        const action = node.data.action || 'read' // 'read', 'write', 'delete', 'read_all'
        const key = this.resolveValue(node.data.params?.key || '', context)

        if (action === 'write' && key) {
          const value = this.resolveValue(node.data.params?.value, context)
          memRepo.set(flowId, String(key), value)
          setContext(node.id, { action: 'write', key, value })
        } else if (action === 'read' && key) {
          const value = memRepo.get(flowId, String(key))
          setContext(node.id, { action: 'read', key, value: value ?? null })
        } else if (action === 'delete' && key) {
          memRepo.delete(flowId, String(key))
          setContext(node.id, { action: 'delete', key })
        } else if (action === 'read_all') {
          const all = memRepo.getAll(flowId)
          setContext(node.id, { action: 'read_all', data: all })
        } else {
          setContext(node.id, { error: 'invalid action or missing key' })
        }

        this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])

        const outEdges = edges.filter(e => e.source === node.id)
        for (const edge of outEdges) {
          const nextNode = nodes.find(n => n.id === edge.target)
          if (nextNode) {
            const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
            if (waitResult) return waitResult
          }
        }

      } else if (['action', 'http_request', 'set_variable', 'script'].includes(node.type)) {
        const actionType = node.data.action_type || node.type

        if (actionType === 'http_request') {
          setContext(node.id, await this.executeHttpRequest(node, context))
        } else if (actionType === 'set_variable') {
          setContext(node.id, this.executeSetVariable(node, context))
        } else if (actionType === 'script') {
          setContext(node.id, await this.executeScript(node, context, serverId))
        } else {
          this.runFlowAction(serverId, node, context)
          setContext(node.id, { executed: true, action: actionType })
        }

        this.pushTrace(serverId, node.id, 'completed', inputSnapshot, context[node.id])
        executedActions.push(actionType)

        const outEdges = edges.filter(e => e.source === node.id)
        for (const edge of outEdges) {
          const nextNode = nodes.find(n => n.id === edge.target)
          if (nextNode) {
            const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
            if (waitResult) return waitResult
          }
        }
      }
    } catch (nodeErr: any) {
      this.pushTrace(serverId, node.id, 'error', inputSnapshot, null, nodeErr.message)
      throw nodeErr
    }

    return null
  }

  // ─── Simple Flow Execution (no Wait nodes) ─────────

  private async executeFlow(flow: Flow, trigger: FlowNode, event: any, serverId: string) {
    const nodes = flow.nodes as FlowNode[]
    const edges = flow.edges as FlowEdge[]
    const executedActions: string[] = []

    const triggerData = { ...event.data, _event_type: event.type, _timestamp: Date.now() }
    const context: Record<string, any> = {
      trigger: triggerData,
      _flowId: flow.id,
      _serverId: serverId,
    }
    if (trigger.data.alias) {
      context[trigger.data.alias] = triggerData
    }

    const setContext = (nodeId: string, value: any) => {
      context[nodeId] = value
      const node = nodes.find(n => n.id === nodeId)
      if (node?.data.alias) {
        context[node.data.alias] = value
      }
    }

    this.pushTrace(serverId, trigger.id, 'completed', {}, context.trigger)

    try {
      const outEdges = edges.filter(e => e.source === trigger.id)
      for (const edge of outEdges) {
        const target = nodes.find(n => n.id === edge.target)
        if (!target) continue
        await this.processNode(target, nodes, edges, context, serverId, executedActions, setContext, false)
      }
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

  // ─── Stateful Branch Execution (flows with Wait nodes) ─────

  private async executeStatefulBranch(flow: Flow, trigger: FlowNode, event: any, serverId: string, analysis: FlowAnalysis) {
    const nodes = flow.nodes as FlowNode[]
    const edges = flow.edges as FlowEdge[]
    const executedActions: string[] = []

    const triggerData = { ...event.data, _event_type: event.type, _timestamp: Date.now() }
    const context: Record<string, any> = {
      trigger: triggerData,
      _flowId: flow.id,
      _serverId: serverId,
    }
    if (trigger.data.alias) {
      context[trigger.data.alias] = triggerData
    }

    const setContext = (nodeId: string, value: any) => {
      context[nodeId] = value
      const node = nodes.find(n => n.id === nodeId)
      if (node?.data.alias) {
        context[node.data.alias] = value
      }
    }

    this.pushTrace(serverId, trigger.id, 'completed', {}, context.trigger)

    try {
      // Walk from trigger, stopping at Wait nodes
      const outEdges = edges.filter(e => e.source === trigger.id)
      for (const edge of outEdges) {
        const target = nodes.find(n => n.id === edge.target)
        if (!target) continue

        const waitNode = await this.processNode(target, nodes, edges, context, serverId, executedActions, setContext, true)

        if (waitNode) {
          // We reached a Wait node - record branch arrival
          const waitConfig = waitNode.data
          const waitAnalysis = analysis.waitNodes.find(w => w.nodeId === waitNode.id)
          if (!waitAnalysis) continue

          let correlationKey: string | null = null
          const correlationMode: 'broadcast' | 'correlation_key' | 'all_to_one' = waitConfig.correlation || 'broadcast'
          if (correlationMode === 'correlation_key' && waitConfig.correlationExpression) {
            correlationKey = String(this.resolveValue(waitConfig.correlationExpression, context))
          }

          const store = WorkflowInstanceStore.getInstance()

          // Capture flow reference for callbacks (flow may be GC'd)
          const flowId = flow.id
          const flowName = flow.name

          store.recordBranchArrival(
            flowId,
            serverId,
            waitNode.id,
            trigger.id,
            { ...context },
            waitConfig.mode || 'all',
            waitAnalysis.requiredTriggers,
            correlationMode,
            correlationKey,
            waitConfig.timeoutMs || 300000,
            // onSatisfied callback - continues execution after wait
            (mergedContext: Record<string, any>) => {
              this.executeBranchFromWait(flow, waitNode, mergedContext, serverId)
            },
            // onTimeout callback
            waitConfig.timeoutAction === 'timeout_branch'
              ? (partialContext: Record<string, any>) => {
                  partialContext._timedOut = true
                  this.executeBranchFromWait(flow, waitNode, partialContext, serverId, 'timeout')
                }
              : undefined
          )
        }
      }
    } catch (err) {
      console.error(`[DSTP Automation] Flow "${flow.name}" stateful branch error:`, err)
    }

    // Log the branch arrival (not the full flow completion)
    if (executedActions.length > 0) {
      this.logRepo(serverId).create({
        flowId: flow.id,
        flowName: flow.name,
        eventType: event.type,
        actions: [...executedActions, '_branch_arrived'],
        context,
      })
    }

    this.flowRepo(serverId).updateStats(flow.id, (flow.triggerCount || 0) + 1)
    this.syncState(serverId)
  }

  // ─── Continue execution after Wait node is satisfied ───

  private async executeBranchFromWait(flow: Flow, waitNode: FlowNode, mergedContext: Record<string, any>, serverId: string, sourceHandle?: string) {
    const nodes = flow.nodes as FlowNode[]
    const edges = flow.edges as FlowEdge[]
    const executedActions: string[] = []

    // Set wait node output in context
    const waitOutput = {
      merged: true,
      mode: mergedContext._mode,
      correlationKey: mergedContext._correlationKey,
      branchCount: Object.keys(mergedContext.branches || {}).length,
      timedOut: mergedContext._timedOut || false,
    }
    mergedContext[waitNode.id] = waitOutput
    if (waitNode.data.alias) {
      mergedContext[waitNode.data.alias] = waitOutput
    }

    const setContext = (nodeId: string, value: any) => {
      mergedContext[nodeId] = value
      const node = nodes.find(n => n.id === nodeId)
      if (node?.data.alias) {
        mergedContext[node.data.alias] = value
      }
    }

    this.pushTrace(serverId, waitNode.id, 'completed', {}, waitOutput)

    try {
      // Filter outgoing edges, optionally by sourceHandle (for timeout branches)
      const outEdges = edges.filter(e => {
        if (e.source !== waitNode.id) return false
        if (sourceHandle) {
          // Follow edges matching the source handle, or edges with no handle
          return e.sourceHandle === sourceHandle || !e.sourceHandle
        }
        // No source handle filter - follow all non-timeout edges
        return e.sourceHandle !== 'timeout'
      })

      for (const edge of outEdges) {
        const nextNode = nodes.find(n => n.id === edge.target)
        if (!nextNode) continue
        await this.processNode(nextNode, nodes, edges, mergedContext, serverId, executedActions, setContext, false)
      }
    } catch (err) {
      console.error(`[DSTP Automation] Flow "${flow.name}" post-wait error:`, err)
    }

    // Log the post-wait execution
    this.logRepo(serverId).create({
      flowId: flow.id,
      flowName: flow.name,
      eventType: '_wait_satisfied',
      actions: executedActions,
      context: mergedContext,
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

  private async executeScript(node: FlowNode, context: Record<string, any>, serverId?: string): Promise<any> {
    const code = node.data.params?.code
    if (!code) return { error: 'no code' }

    try {
      // context.store — shared in-memory key-value (between flows, lost on restart)
      const store = LiveAutomation.getStore(serverId || '')
      context.store = store
      // context.memory — persistent key-value per flow (survives restart, stored in SQLite)
      const flowId = context._flowId || ''
      const memRepo = new FlowMemoryRepository(serverId || '')
      context.memory = {
        get: (key: string) => memRepo.get(flowId, key),
        set: (key: string, value: any) => memRepo.set(flowId, key, value),
        delete: (key: string) => memRepo.delete(flowId, key),
        getAll: () => memRepo.getAll(flowId),
      }
      // context.sendCommand(type, data) sends a command to the DST server
      context.sendCommand = (type: string, data: any = {}) => {
        dstStateStore.pushCommandToServer(serverId || '', type, data)
      }

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
