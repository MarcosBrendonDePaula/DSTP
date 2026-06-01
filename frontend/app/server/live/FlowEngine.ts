// FlowEngine - The flow execution engine, extracted from LiveAutomation.
//
// The engine is parameterized by an injectable "host" (EngineHost) so it can run
// both in the main process (direct host) and, in the future, inside a Worker
// (host via RPC). This file contains ONLY the execution motor — flow CRUD and
// the LiveComponent UI actions remain in LiveAutomation.

import { FlowRepository, AutomationLogRepository, FlowMemoryRepository, type FlowNode, type FlowEdge, type Flow } from '../db'
import { getAnalysis, type FlowAnalysis } from './FlowAnalyzer'
import { WorkflowInstanceStore } from './WorkflowInstanceStore'

// ─── Host interface ──────────────────────────────────
// All external side-effects the engine needs are injected via this host, so the
// same engine can run against the main process (direct) or a worker (RPC).

export interface EngineHost {
  // enqueue a command for the DST server (today: dstStateStore.pushCommandToServer)
  pushCommand(serverId: string, type: string, data: any): void
  // read the server/player groups (today: dstStateStore.getServerGroups)
  getServerGroups(): any[]
  // emit a STATE_DELTA to the panel (today: this.setState)
  emitState(delta: Record<string, any>): void
  // request activation of an event category (today: dstStateStore.requestEventToggleForServer)
  requestEventToggle(serverId: string, category: string, enabled: boolean): void
}

// Shared storage between flows — Script nodes can read/write via context.store
const MAX_STORE_KEYS = 500
// Capture mode — when active, execution traces are collected and emitted at the end
const MAX_CAPTURE_TRACE = 200

// Editor inputs are always strings (React text fields), but the mod's commands
// expect numbers for certain fields (heal amount, count, coords...). DoDelta("100")
// in Lua doesn't behave like DoDelta(100). We coerce ONLY known-numeric/boolean
// fields by name — NOT blindly — so a message/name/prefab that happens to be "100"
// or "true" stays a string. Param keys whose value should be a number:
const NUMERIC_PARAM_KEYS = new Set([
  'amount', 'count', 'x', 'y', 'z', 'radius', 'limit', 'duration', 'days', 'speed',
  'length', 'day', 'dusk', 'night', 'slot', 'width', 'height', 'value', 'max',
  'offset_x', 'offset_z',
])
const BOOLEAN_PARAM_KEYS = new Set(['enabled'])

function coerceParam(key: string, v: any): any {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if (t === '') return v
  if (BOOLEAN_PARAM_KEYS.has(key)) {
    if (t === 'true') return true
    if (t === 'false') return false
  }
  if (NUMERIC_PARAM_KEYS.has(key) && /^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t)
    if (Number.isFinite(n)) return n
  }
  return v
}

export class FlowEngine {
  constructor(private host: EngineHost) {}

  // Allow re-pointing the host (e.g. headless → live component) without losing
  // engine state (flow storage, active capture).
  setHost(host: EngineHost) {
    this.host = host
  }

  // Capture mode — when active, execution traces are collected and emitted at the end
  private _captureServerId: string | null = null
  private _captureTrace: Array<{ nodeId: string; status: string; input: Record<string, any>; output: any; error?: string; timestamp: number }> = []
  private _captureTimeout: ReturnType<typeof setTimeout> | null = null

  // Shared storage between flows — Script nodes can read/write via context.store
  private _flowStorage: Record<string, Record<string, any>> = {}

  getStore(serverId: string): Record<string, any> {
    if (!this._flowStorage[serverId]) this._flowStorage[serverId] = {}
    const store = this._flowStorage[serverId]
    // Evict oldest keys if over limit
    const keys = Object.keys(store)
    if (keys.length > MAX_STORE_KEYS) {
      const toRemove = keys.slice(0, keys.length - MAX_STORE_KEYS)
      for (const k of toRemove) delete store[k]
    }
    return store
  }

  clearStore(serverId: string) {
    delete this._flowStorage[serverId]
  }

  // ─── Helpers ───────────────────────────────────────

  private flowRepo(serverId: string) { return new FlowRepository(serverId) }
  private logRepo(serverId: string) { return new AutomationLogRepository(serverId) }

  // Stats/log writes are best-effort bookkeeping: under burst load the DB can be
  // momentarily locked (SQLITE_BUSY) even with busy_timeout. Never let that
  // bubble up and kill the worker — losing one stat bump or log row is fine,
  // losing the whole core (and the events queued behind it) is not.
  private safeUpdateStats(serverId: string, flowId: string, triggerCount: number) {
    try { this.flowRepo(serverId).updateStats(flowId, triggerCount) }
    catch (err: any) { console.warn(`[FlowEngine] updateStats failed for ${flowId}: ${err?.message ?? err}`) }
  }

  private safeLog(serverId: string, entry: any) {
    try { this.logRepo(serverId).create(entry) }
    catch (err: any) { console.warn(`[FlowEngine] log create failed: ${err?.message ?? err}`) }
  }

  // Current world state (phase/day/season) for a server, read from the host's
  // server groups (the worker mirror carries a `world` field per group). Lets
  // every trigger expose {{trigger.phase}}/{{trigger.day}}/{{trigger.season}}.
  private worldFor(serverId: string): { phase: string; day: number; season: string } {
    const groups = this.host.getServerGroups()
    const g = groups.find((x: any) => x.server_id === serverId)
    return g?.world ?? { phase: 'unknown', day: 0, season: 'unknown' }
  }

  private syncState(serverId: string) {
    const flows = this.flowRepo(serverId).findAll()
    const logs = this.logRepo(serverId).findRecent()
    console.log(`[DSTP Automation] syncState(${serverId}): ${flows.length} flows, ${logs.length} logs`)
    this.host.emitState({ [`flows:${serverId}`]: flows, [`logs:${serverId}`]: logs } as any)
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

  startCapture(serverId: string) {
    this._captureServerId = serverId
    this._captureTrace = []
    // Auto-stop after 5 minutes to prevent unbounded memory growth
    if (this._captureTimeout) clearTimeout(this._captureTimeout)
    this._captureTimeout = setTimeout(() => this.stopCapture(serverId), 5 * 60 * 1000)
    this.host.emitState({ [`capture:${serverId}`]: { active: true } } as any)
  }

  stopCapture(serverId: string) {
    if (this._captureTimeout) {
      clearTimeout(this._captureTimeout)
      this._captureTimeout = null
    }
    this._captureServerId = null
    this._captureTrace = []
    this.host.emitState({ [`capture:${serverId}`]: null } as any)
  }

  private pushTrace(serverId: string, nodeId: string, status: string, input: Record<string, any>, output: any, error?: string) {
    if (this._captureServerId !== serverId) return
    if (this._captureTrace.length >= MAX_CAPTURE_TRACE) return
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
          const groups = this.host.getServerGroups()
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
          const groups = this.host.getServerGroups()
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

    const world = this.worldFor(serverId)
    const triggerData = {
      ...event.data,
      _event_type: event.type,
      _timestamp: Date.now(),
      // World context on every event, so conditions can check {{trigger.phase}}
      // etc even for events that don't natively carry it (e.g. player_attacked).
      // Event data takes precedence if it already provides these keys.
      phase: event.data?.phase ?? world.phase,
      day: event.data?.day ?? world.day,
      season: event.data?.season ?? world.season,
    }
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
      this.host.emitState({ [`capture:${serverId}`]: {
        active: false,
        flowId: flow.id,
        trace: this._captureTrace,
        context,
      }} as any)
      this._captureServerId = null
      this._captureTrace = []
    }

    // Always log and update stats
    this.safeUpdateStats(serverId, flow.id, (flow.triggerCount || 0) + 1)

    this.safeLog(serverId, {
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

    const world = this.worldFor(serverId)
    const triggerData = {
      ...event.data,
      _event_type: event.type,
      _timestamp: Date.now(),
      // World context on every event, so conditions can check {{trigger.phase}}
      // etc even for events that don't natively carry it (e.g. player_attacked).
      // Event data takes precedence if it already provides these keys.
      phase: event.data?.phase ?? world.phase,
      day: event.data?.day ?? world.day,
      season: event.data?.season ?? world.season,
    }
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
      this.safeLog(serverId, {
        flowId: flow.id,
        flowName: flow.name,
        eventType: event.type,
        actions: [...executedActions, '_branch_arrived'],
        context,
      })
    }

    this.safeUpdateStats(serverId, flow.id, (flow.triggerCount || 0) + 1)
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
    this.safeLog(serverId, {
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
      actionData[key] = coerceParam(key, this.resolveValue(val, context))
    }

    // UI widget actions: convert to ui_command for per-player delivery
    if (actionType.startsWith('ui_')) {
      const userid = actionData.userid
      delete actionData.userid

      let cmd: any
      if (actionType === 'ui_notification') {
        cmd = { action: 'create', id: `notif_${Date.now()}`, type: 'notification', text: actionData.text, duration: Number(actionData.duration) || 5 }
      } else if (actionType === 'ui_label') {
        cmd = { action: 'create', id: actionData.id || `label_${Date.now()}`, type: 'label', text: actionData.text, x: Number(actionData.x) || 0, y: Number(actionData.y) || 0, anchor: actionData.anchor || 'top' }
      } else if (actionType === 'ui_panel') {
        cmd = { action: 'create', id: actionData.id || `panel_${Date.now()}`, type: 'panel', title: actionData.title, body: actionData.body, width: Number(actionData.width) || 400, height: Number(actionData.height) || 300 }
      } else if (actionType === 'ui_progress_bar') {
        const val = Number(actionData.value) || 0
        const max = Number(actionData.max) || 1
        cmd = { action: 'create', id: actionData.id || `bar_${Date.now()}`, type: 'progress_bar', value: val / max, label: actionData.label, width: Number(actionData.width) || 200 }
      } else if (actionType === 'ui_destroy') {
        cmd = { action: 'destroy', id: actionData.id }
      } else if (actionType === 'ui_clear') {
        cmd = { action: 'clear' }
      }

      if (cmd && userid) {
        this.host.pushCommand(serverId, 'ui_command', { userid, cmd })
      }
      return
    }

    // Rule actions: install/uninstall rules, set state
    if (actionType.startsWith('rule_')) {
      const userid = actionData.userid
      delete actionData.userid

      if (actionType === 'rule_install') {
        // rules field comes as JSON string, parse it
        let rules = actionData.rules
        if (typeof rules === 'string') {
          try { rules = JSON.parse(rules) } catch { return }
        }
        if (!Array.isArray(rules)) rules = [rules]
        this.host.pushCommand(serverId, userid ? 'install_rules' : 'install_rules_all', {
          userid, rules, seq: Date.now(),
        })
      } else if (actionType === 'rule_uninstall') {
        let ids = actionData.ids
        if (typeof ids === 'string') ids = ids.split(',').map((s: string) => s.trim())
        if (!Array.isArray(ids)) ids = [ids]
        this.host.pushCommand(serverId, 'uninstall_rules', {
          userid, ids, seq: Date.now(),
        })
      } else if (actionType === 'rule_set_state') {
        this.host.pushCommand(serverId, 'set_player_state', {
          userid,
          key: actionData.key,
          value: actionData.value,
          seq: Date.now(),
        })
      }
      return
    }

    this.host.pushCommand(serverId, actionType, actionData)
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
  // Admin-only by design. When the engine runs inside a per-server worker core
  // (the normal path), the script is isolated to that core: a runaway loop or
  // crash takes down only that server's core (auto-respawned by the watchdog),
  // not the API process or other servers. context.{sendCommand,memory,
  // getPlayers,store} resolve locally inside the worker — no async/RPC needed,
  // since the script already runs where the engine lives.

  private async executeScript(node: FlowNode, context: Record<string, any>, serverId?: string): Promise<any> {
    const code = node.data.params?.code
    if (!code) return { error: 'no code' }

    try {
      // context.store — shared in-memory key-value (between flows, lost on restart)
      const store = this.getStore(serverId || '')
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
        this.host.pushCommand(serverId || '', type, data)
      }
      // context.getPlayers() returns the current player list (all shards) for this server,
      // including buffs (is_ghost, is_starving, etc) as reported by the mod.
      context.getPlayers = () => {
        const groups = this.host.getServerGroups()
        const g = groups.find(x => x.server_id === serverId)
        return g ? g.all_players : []
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

  ensureEventCategories(flow: any) {
    const categoryMap: Record<string, string> = {
      player_spawn: 'players', player_left: 'players', player_death: 'players',
      player_ghost: 'players', player_respawn: 'players', player_disconnected: 'players',
      structure_burnt: 'griefing', structure_hammered: 'griefing',
      container_opened: 'griefing', container_closed: 'griefing',
      chat_message: 'chat',
      new_day: 'world', phase_changed: 'world', season_changed: 'world',
      moon_phase_changed: 'world', earthquake: 'world', sinkhole_warn: 'world',
      world_save: 'world', player_teleported: 'world',
      player_kill: 'combat', player_attacked: 'combat',
      player_craft: 'crafting', player_build: 'crafting',
      player_equip: 'inventory', player_pickup: 'inventory', player_drop: 'inventory', player_unequip: 'inventory',
      storm_changed: 'weather', precipitation: 'weather', lightning_strike: 'weather',
      boss_event: 'bosses', boss_killed: 'bosses', fire_started: 'bosses',
      hound_warning: 'bosses', hound_attack: 'bosses',
      player_eat: 'survival', player_insane: 'survival', player_sane: 'survival',
      player_starving: 'survival', player_fed: 'survival',
      player_freezing: 'survival', player_cooled: 'survival',
      player_overheating: 'survival', player_warm: 'survival',
      player_mounted: 'survival', player_dismounted: 'survival',
      player_work: 'gathering', resource_gathered: 'gathering', player_harvest: 'gathering', player_startfire: 'gathering',
      health_delta: 'health', hunger_delta: 'health', sanity_delta: 'health',
      recipe_learned: 'character', book_read: 'character', character_transform: 'character',
      player_sleep_start: 'character', player_sleep_end: 'character',
      player_sunk: 'exploration', fish_caught: 'exploration',
      boat_entered: 'exploration', boat_exited: 'exploration',
    }

    const needed = new Set<string>()
    for (const node of flow.nodes || []) {
      if (node.type === 'trigger' && categoryMap[node.data.event_type]) {
        needed.add(categoryMap[node.data.event_type])
      }
    }

    for (const cat of needed) {
      this.host.requestEventToggle(flow.server_id, cat, true)
    }
  }
}
