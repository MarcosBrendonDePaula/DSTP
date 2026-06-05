// FlowEngine - The flow execution engine, extracted from LiveAutomation.
//
// The engine is parameterized by an injectable "host" (EngineHost) so it can run
// both in the main process (direct host) and, in the future, inside a Worker
// (host via RPC). This file contains ONLY the execution motor — flow CRUD and
// the LiveComponent UI actions remain in LiveAutomation.

import { FlowRepository, AutomationLogRepository, FlowMemoryRepository, type FlowNode, type FlowEdge, type Flow } from '../db'
import { getAnalysis, type FlowAnalysis } from './FlowAnalyzer'
import { WorkflowInstanceStore } from './WorkflowInstanceStore'
import { resolveValue, evaluateCondition as evalCondition, stripCommandPrefix } from './expressions'
import { createLoopGuard, recordVisit, type LoopGuard } from './loop-guard'
import { installVaultAccessors, maskSecrets } from './vault-context'
import { executeAIAgent } from './ai/executeAIAgent'
import { getNodeEntry } from './nodes/registry'
import type { NodeRunContext } from './nodes/types'

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
  // set the FULL set of keys the client should watch for the key_pressed trigger
  // (today: dstStateStore.requestWatchKeysForServer). NOT a category — a parallel channel.
  requestWatchKeys(serverId: string, keys: string[]): void
}

// Shared storage between flows — Script nodes can read/write via context.store
const MAX_STORE_KEYS = 500
// Capture mode — when active, execution traces are collected and emitted at the end
const MAX_CAPTURE_TRACE = 200
// Upper bound for a delay node (1h). Prevents a flow holding an execution +
// its resolved-secret context alive indefinitely.
const MAX_DELAY_MS = 60 * 60 * 1000

// Loop protection — see loop-guard.ts. The guard is stashed on the context
// under this key so it rides along the recursion without changing 11 call
// signatures. The __ prefix keeps it from colliding with user data paths.
const LOOP_GUARD_KEY = '__loopGuard'
// Per-execution capture buffer, stashed non-enumerably on the context (like the
// loop guard) so concurrent flows don't share one engine-wide trace array.
const CAPTURE_BUFFER_KEY = '__captureBuffer'

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
const BOOLEAN_PARAM_KEYS = new Set(['enabled', 'drop', 'visible'])

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
  // Trace buffers are per-execution (on each context), not engine-wide — see
  // captureBufferFor. The engine keeps only the on/off gate + auto-stop timer.
  private _captureTimeout: ReturnType<typeof setTimeout> | null = null
  // Accumulated traces per flow while capture is on. A flow with multiple triggers
  // (e.g. chat_message + ui_callback) runs once per trigger; we merge those runs so
  // the editor shows every entry point, not just the first. Capture stays ON until
  // auto-stop/stopCapture — it does NOT end after the first execution. Keyed by
  // flowId; reset on startCapture.
  private _captureTraces: Map<string, any[]> = new Map()
  private _captureContexts: Map<string, any> = new Map()

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
      // Both `trigger` nodes (game events, matched by event_type) and `webhook`
      // nodes (inbound HTTP, matched by node id == event.webhookId) act as entry
      // points. From here on a matched node is just "the trigger" for the flow.
      const triggers = (flow.nodes as FlowNode[]).filter(n => n.type === 'trigger' || n.type === 'webhook')
      for (const trigger of triggers) {
        let matches = trigger.type === 'webhook'
          ? (event.type === 'webhook' && event.webhookId === trigger.id)
          : (trigger.data.event_type === event.type)
        // key_pressed needs an EXTRA match on the specific key, so a flow watching
        // 'H' doesn't fire on 'J' (case-insensitive). Same shape as webhook's id match.
        if (matches && event.type === 'key_pressed') {
          const want = String(this.param(trigger, 'key') ?? '').toUpperCase()
          matches = want !== '' && want === String(event.data?.key ?? '').toUpperCase()
        }
        if (matches) {
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
    this._captureTraces.clear()
    this._captureContexts.clear()
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
    this._captureTraces.clear()
    this._captureContexts.clear()
    this.host.emitState({ [`capture:${serverId}`]: null } as any)
  }

  // The capture buffer lives on each execution's context (non-enumerable), NOT on
  // the engine — so concurrent flows in the same worker don't mix traces into a
  // shared array (and one flow finishing can't steal/flush another's). The engine
  // only holds the "is capture on for this server?" gate.
  private captureBufferFor(context: Record<string, any> | undefined): Array<any> | null {
    if (!context) return null
    let buf: Array<any> = (context as any)[CAPTURE_BUFFER_KEY]
    if (!buf) {
      buf = []
      Object.defineProperty(context, CAPTURE_BUFFER_KEY, { value: buf, enumerable: false, configurable: true })
    }
    return buf
  }

  private pushTrace(serverId: string, nodeId: string, status: string, input: Record<string, any>, output: any, error?: string, context?: Record<string, any>) {
    if (this._captureServerId !== serverId) return
    const buf = this.captureBufferFor(context)
    if (!buf || buf.length >= MAX_CAPTURE_TRACE) return
    // Mask secrets at push time so plaintext never lands in the buffer.
    const maskCtx = context ?? input
    buf.push({
      nodeId,
      status,
      input: maskSecrets({ ...input }, maskCtx),
      output: maskSecrets(output, maskCtx),
      error,
      timestamp: Date.now(),
    })
  }

  // Trace a node as completed with its own output. Wraps the verbose pushTrace
  // call every node-handler ends with (input snapshot + context[node.id]).
  private traceCompleted(serverId: string, nodeId: string, inputSnapshot: Record<string, any>, context: Record<string, any>) {
    this.pushTrace(serverId, nodeId, 'completed', inputSnapshot, context[nodeId], undefined, context)
  }

  // Read a node param, preferring the live `params` bag over the legacy flat
  // `data` field. Uses ?? (not ||) so 0/"" are kept; `def` is the final fallback.
  private param(node: FlowNode, key: string, def: any = undefined): any {
    return node.data.params?.[key] ?? (node.data as any)[key] ?? def
  }

  // Stable id for a UI node's widget/group (author-set id or a per-node default).
  private uiNodeId(node: FlowNode): string {
    return this.param(node, 'id') || `ui_${node.id}`
  }

  // Find the first player in `serverId`'s shard group matching `predicate`.
  private findPlayerInServer(serverId: string, predicate: (p: any) => boolean): any | null {
    for (const g of this.host.getServerGroups()) {
      if (g.server_id !== serverId) continue
      const found = g.all_players.find(predicate)
      if (found) return found
    }
    return null
  }

  // Build the capability bag a migrated node handler (exec.ts) runs against. All
  // the engine internals a handler might need are bound here so the handler never
  // reaches into FlowEngine directly. Heavy helpers (runFlowAction, buildUITree,
  // executeAIAgent…) stay methods of the engine and are just exposed.
  private buildRunContext(
    node: FlowNode,
    nodes: FlowNode[],
    edges: FlowEdge[],
    context: Record<string, any>,
    serverId: string,
    executedActions: string[],
    setContext: (nodeId: string, value: any) => void,
    stopAtWait: boolean,
    followOutEdges: (filter?: (edge: FlowEdge) => boolean) => Promise<FlowNode | null>,
  ): NodeRunContext {
    return {
      node, nodes, edges, context, serverId, executedActions, stopAtWait,
      resolve: (tpl) => this.resolveValue(tpl, context),
      param: (key, def) => this.param(node, key, def),
      setContext: (value) => setContext(node.id, value),
      findPlayerInServer: (predicate) => this.findPlayerInServer(serverId, predicate),
      evaluateCondition: () => this.evaluateCondition(node, context),
      followOutEdges,
      pushCommand: (type, data) => this.host.pushCommand(serverId, type, data),
      log: (message) => console.log(`[DSTP Flow] ${maskSecrets(String(message), context)}`),
      runFlowAction: () => this.runFlowAction(serverId, node, context),
      executeHttpRequest: () => this.executeHttpRequest(node, context),
      executeSetVariable: () => this.executeSetVariable(node, context),
      executeScript: () => this.executeScript(node, context, serverId),
      runAiMemory: (args) => this.runAiMemory(serverId, context, args),
      buildUITree: () => this.buildUITree(node, nodes, edges, context),
      resolveTree: (tree) => this.resolveTree(tree, context),
      uiNodeId: () => this.uiNodeId(node),
      executeAIAgent: () => this.runAiAgentNode(node, nodes, edges, context, serverId),
    }
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
    // ── Loop protection ── (see loop-guard.ts)
    // DSTP has no loop node, so a node repeating within one execution means the
    // graph has an accidental cycle. The guard rides on the context so every
    // recursive branch shares one counter.
    let guard: LoopGuard = (context as any)[LOOP_GUARD_KEY]
    if (!guard) {
      guard = createLoopGuard()
      ;(context as any)[LOOP_GUARD_KEY] = guard
    }
    const guardResult = recordVisit(guard, node.id)
    if (!guardResult.ok) {
      if (guardResult.tripped) {
        const { reason, visits, steps } = guardResult.tripped
        console.error(`[FlowEngine] Loop guard tripped (server ${serverId}): ${reason}. Aborting execution.`)
        this.safeLog(serverId, {
          flowId: (context as any)._flowId || 'unknown',
          flowName: (context as any)._flowName || 'unknown',
          eventType: (context as any).trigger?._event_type || 'unknown',
          actions: [`loop_guard_abort: ${reason}`],
          context: { reason, nodeId: node.id, visits, steps },
        })
      }
      return null
    }

    // If this is a wait node and we should stop, return it
    if (node.type === 'wait' && stopAtWait) return node

    const inputSnapshot = { ...context }

    // Walk a node's outgoing edges, recursing into each target. `filter` lets a
    // node skip edges (e.g. condition follows only the true/false branch). If a
    // recursion hits a wait node (stopAtWait), it bubbles that node back up so
    // the caller can pause the branch there.
    const followOutEdges = async (
      filter?: (edge: FlowEdge) => boolean,
    ): Promise<FlowNode | null> => {
      const outEdges = edges.filter(e => e.source === node.id && (!filter || filter(e)))
      for (const edge of outEdges) {
        const nextNode = nodes.find(n => n.id === edge.target)
        if (nextNode) {
          const waitResult = await this.processNode(nextNode, nodes, edges, context, serverId, executedActions, setContext, stopAtWait)
          if (waitResult) return waitResult
        }
      }
      return null
    }

    // ── Registry dispatch ──
    // Every node type is a migrated module EXCEPT `wait` (its stateful pause /
    // early-return lives in the orchestrator — handled below). Run the handler and
    // centralize tracing + edge-following here.
    const entry = node.type !== 'wait' ? getNodeEntry(node.type) : undefined
    if (entry) {
      const rc = this.buildRunContext(node, nodes, edges, context, serverId, executedActions, setContext, stopAtWait, followOutEdges)
      try {
        const result = await entry.handler(rc)
        this.traceCompleted(serverId, node.id, inputSnapshot, context)
        if (typeof result === 'object') {
          if ('wait' in result) return result.wait
          // Filtered follow (condition true/false). Traced above.
          return await followOutEdges(result.followEdges)
        }
        if (result === 'stop') return null
        return await followOutEdges()
      } catch (nodeErr: any) {
        this.pushTrace(serverId, node.id, 'error', inputSnapshot, null, nodeErr.message, context)
        throw nodeErr
      }
    }

    // `wait` — the only node NOT in the registry. In simple-flow mode
    // (stopAtWait=false) it just passes through; the stateful pause is the
    // early-return at the top of this method.
    try {
      if (node.type === 'wait') {
        setContext(node.id, { waited: true, passthrough: true })
        this.traceCompleted(serverId, node.id, inputSnapshot, context)

        const waitResult = await followOutEdges()
        if (waitResult) return waitResult
      }
    } catch (nodeErr: any) {
      this.pushTrace(serverId, node.id, 'error', inputSnapshot, null, nodeErr.message, context)
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
      _flowName: flow.name,
      _serverId: serverId,
    }
    // Lazy {{environment.x.y}} / {{env.y}} accessors (decrypt on read, masked later).
    installVaultAccessors(context, serverId)
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

    this.pushTrace(serverId, trigger.id, 'completed', {}, context.trigger, undefined, context)

    try {
      const outEdges = edges.filter(e => e.source === trigger.id)
      for (const edge of outEdges) {
        const target = nodes.find(n => n.id === edge.target)
        if (!target) continue
        await this.processNode(target, nodes, edges, context, serverId, executedActions, setContext, false)
      }
    } catch (err) {
      console.error(`[DSTP Automation] Flow "${flow.name}" error:`, maskSecrets(String((err as any)?.message ?? err), context))
    }

    // If capturing, MERGE this execution's trace into the flow's accumulated trace
    // and emit it — but keep capture ON. A multi-trigger flow runs once per entry
    // point (chat_message, then ui_callback, ...); accumulating means the editor
    // shows all of them instead of only the first run. Capture ends on auto-stop
    // or stopCapture, never on a single execution finishing. Already masked at push
    // time; mask the context snapshot too. Per-node entries are de-duplicated by
    // nodeId (a re-run of the same node updates its entry) so repeated triggers of
    // the same path don't pile up duplicates.
    if (this._captureServerId === serverId) {
      const trace = (context as any)[CAPTURE_BUFFER_KEY] ?? []
      const merged = new Map<string, any>(
        (this._captureTraces.get(flow.id) ?? []).map(e => [e.nodeId, e]),
      )
      for (const entry of trace) merged.set(entry.nodeId, entry)
      const mergedTrace = [...merged.values()]
      this._captureTraces.set(flow.id, mergedTrace)
      // Keep the latest context per flow (newest run wins for {{...}} preview).
      this._captureContexts.set(flow.id, context)

      this.host.emitState({ [`capture:${serverId}`]: {
        active: true,
        flowId: flow.id,
        trace: maskSecrets(mergedTrace, context),
        context: maskSecrets(context, context),
      }} as any)
    }

    // Always log and update stats
    this.safeUpdateStats(serverId, flow.id, (flow.triggerCount || 0) + 1)

    this.safeLog(serverId, {
      flowId: flow.id,
      flowName: flow.name,
      eventType: event.type,
      actions: executedActions,
      context: maskSecrets(context, context),
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
      _flowName: flow.name,
      _serverId: serverId,
    }
    installVaultAccessors(context, serverId)
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

    this.pushTrace(serverId, trigger.id, 'completed', {}, context.trigger, undefined, context)

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
            maskSecrets({ ...context }, context),
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
      console.error(`[DSTP Automation] Flow "${flow.name}" stateful branch error:`, maskSecrets(String((err as any)?.message ?? err), context))
    }

    // Log the branch arrival (not the full flow completion)
    if (executedActions.length > 0) {
      this.safeLog(serverId, {
        flowId: flow.id,
        flowName: flow.name,
        eventType: event.type,
        actions: [...executedActions, '_branch_arrived'],
        context: maskSecrets(context, context),
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
    // The merged context came from serialized branch snapshots, which dropped the
    // non-enumerable vault accessors — reinstall so post-wait nodes can resolve
    // {{environment.x.y}} / {{env.y}} again (and secrets get masked in logs).
    installVaultAccessors(mergedContext, serverId)

    const setContext = (nodeId: string, value: any) => {
      mergedContext[nodeId] = value
      const node = nodes.find(n => n.id === nodeId)
      if (node?.data.alias) {
        mergedContext[node.data.alias] = value
      }
    }

    this.pushTrace(serverId, waitNode.id, 'completed', {}, waitOutput, undefined, mergedContext)

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
      console.error(`[DSTP Automation] Flow "${flow.name}" post-wait error:`, maskSecrets(String((err as any)?.message ?? err), mergedContext))
    }

    // Log the post-wait execution
    this.safeLog(serverId, {
      flowId: flow.id,
      flowName: flow.name,
      eventType: '_wait_satisfied',
      actions: executedActions,
      context: maskSecrets(mergedContext, mergedContext),
    })

    this.syncState(serverId)
  }

  // ─── Resolve template variables from context ───────
  // Supports: {{trigger.name}}, {{node_id.field}}, {{node_id.body.key}}, plain values

  // Delegates to the pure, unit-tested resolver in expressions.ts.
  private resolveValue(template: any, context: Record<string, any>): any {
    return resolveValue(template, context)
  }

  // ─── Condition evaluator ───────────────────────────
  // Delegates to the pure, unit-tested evaluator in expressions.ts.
  private evaluateCondition(node: FlowNode, context: Record<string, any>): boolean {
    return evalCondition(node.data, context)
  }

  // ─── UI tree builder (compose UI from connected ui_* nodes) ───

  // Walk the subgraph rooted at a ui_* node and produce a render tree:
  //   { type, ...props, children: [...] }
  // Children are the targets of this node's outgoing edges, ordered by canvas
  // position: vertical (Y) for col/panel, horizontal (X) for row. Templates in
  // props are resolved against the flow context. `seen` guards against cycles.
  private buildUITree(
    node: FlowNode,
    nodes: FlowNode[],
    edges: FlowEdge[],
    context: Record<string, any>,
    seen: Set<string> = new Set(),
  ): any {
    if (seen.has(node.id)) return null
    seen.add(node.id)

    const TYPE_MAP: Record<string, string> = {
      ui_panel: 'panel', ui_col: 'col', ui_row: 'row', ui_tabs: 'tabs',
      ui_text: 'text', ui_icon: 'icon', ui_image: 'image',
      ui_button: 'button', ui_bar: 'bar', ui_spacer: 'spacer',
      ui_text_input: 'text_input',
    }
    const type = TYPE_MAP[node.type] || node.type.replace(/^ui_/, '')
    const p = node.data.params || {}
    const r = (v: any) => this.resolveValue(v, context)

    // Common props per type. Numeric fields are coerced.
    const out: any = { type }
    const num = (v: any) => { const n = Number(r(v)); return Number.isFinite(n) ? n : undefined }
    const color = (v: any) => {
      const rv = r(v)
      if (Array.isArray(rv)) return rv
      if (typeof rv === 'string' && rv.trim().startsWith('[')) { try { return JSON.parse(rv) } catch { return undefined } }
      return undefined
    }

    // Generic on every node: an explicit node_id makes it addressable for
    // ui_set, and a callback makes ANY node clickable (emits ui_callback).
    if (p.node_id) out.id = String(p.node_id)
    if (p.callback) out.callback = String(r(p.callback))

    if (type === 'panel') {
      if (p.title) out.title = r(p.title)
      if (p.body) out.body = r(p.body)
      out.closeable = p.closeable !== false && p.closeable !== 'false'
      if (p.draggable === true || p.draggable === 'true') out.draggable = true
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
      if (p.gap != null) out.gap = num(p.gap)
    } else if (type === 'col' || type === 'row') {
      if (p.gap != null) out.gap = num(p.gap)
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
    } else if (type === 'text') {
      out.text = String(r(p.text) ?? '')
      if (p.size != null) out.size = num(p.size)
      const c = color(p.color); if (c) out.color = c
      if (p.wrap_width != null) out.wrap_width = num(p.wrap_width)
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
    } else if (type === 'icon') {
      if (p.prefab) out.prefab = String(r(p.prefab))
      if (p.atlas) out.atlas = r(p.atlas)
      if (p.tex) out.tex = r(p.tex)
      if (p.size != null) out.size = num(p.size)
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
    } else if (type === 'image') {
      out.atlas = r(p.atlas); out.tex = r(p.tex)
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
    } else if (type === 'button') {
      out.text = String(r(p.text) ?? 'OK')
      out.callback = String(r(p.callback) ?? p.text ?? 'click')
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
      if (p.size != null) out.size = num(p.size)
      const c = color(p.color); if (c) out.color = c
    } else if (type === 'bar') {
      out.value = num(p.value) ?? 0
      out.max = num(p.max) ?? 1
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
      if (p.label != null) out.label = String(r(p.label))
      const c = color(p.color); if (c) out.color = c
    } else if (type === 'spacer') {
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
    } else if (type === 'text_input') {
      // Editable field. callback fires on Enter with the typed string in callback_data.
      out.callback = String(r(p.callback) ?? 'submit')
      if (p.value != null) out.value = String(r(p.value))
      if (p.placeholder != null) out.placeholder = String(r(p.placeholder))
      if (p.size != null) out.size = num(p.size)
      const c = color(p.color); if (c) out.color = c
      if (p.width != null) out.width = num(p.width)
      if (p.height != null) out.height = num(p.height)
      if (p.max != null) out.max = num(p.max)
      if (p.password === true || p.password === 'true') out.password = true
      if (p.clear_on_submit === true || p.clear_on_submit === 'true') out.clear_on_submit = true
    }

    // Children: edge targets, ordered by canvas position. col/panel stack
    // top→down (ascending Y in screen terms = our nodes use descending Y for
    // "lower on screen", but React Flow Y grows downward, so ascending Y = top
    // first). row orders left→right (ascending X).
    const childNodes = edges
      .filter(e => e.source === node.id)
      .map(e => nodes.find(n => n.id === e.target))
      .filter((n): n is FlowNode => !!n && n.type.startsWith('ui_'))

    const axis = type === 'row' ? 'x' : 'y'
    childNodes.sort((a, b) =>
      axis === 'x' ? a.position.x - b.position.x : a.position.y - b.position.y)

    if (type === 'tabs') {
      // Each child is one tab; its tab_label (or title) is the tab button text.
      out.active = num(p.active) ?? 0
      out.tabs = childNodes.map((c, i) => {
        const label = this.resolveValue(c.data.params?.tab_label ?? c.data.params?.title ?? `Aba ${i + 1}`, context)
        return { label: String(label), child: this.buildUITree(c, nodes, edges, context, seen) }
      }).filter(t => t.child)
      return out
    }

    const children = childNodes
      .map(c => this.buildUITree(c, nodes, edges, context, seen))
      .filter(Boolean)
    if (children.length) out.children = children

    return out
  }

  // Resolve {{templates}} throughout a literal UI tree (from a ui_builder node),
  // returning a new tree. Strings are resolved; children/tabs recursed; numbers
  // and arrays (e.g. color) pass through. Coerces numeric-ish props by key.
  private resolveTree(node: any, context: Record<string, any>): any {
    if (node == null || typeof node !== 'object') return node
    const out: any = {}
    for (const [k, v] of Object.entries(node)) {
      if (k === 'children' && Array.isArray(v)) {
        out.children = v.map(c => this.resolveTree(c, context))
      } else if (k === 'tabs' && Array.isArray(v)) {
        out.tabs = v.map((t: any) => ({ label: this.resolveValue(t.label, context), child: this.resolveTree(t.child, context) }))
      } else if (typeof v === 'string') {
        out[k] = this.resolveValue(v, context)
      } else {
        out[k] = v
      }
    }
    return out
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
      } else if (actionType === 'ui_set_text') {
        // Legacy convenience: patch a text node by string. Generalized by ui_set.
        cmd = { action: 'set', id: actionData.id, node: actionData.node, props: { text: String(actionData.text ?? '') } }
      } else if (actionType === 'ui_set') {
        // Generic in-place patch of any addressable node's props. `props` may be
        // a JSON string or an object: { text, color, value, max, visible, tint,
        // prefab, tex, atlas }. id = tree/group id, node = the node's node_id.
        let props = actionData.props
        if (typeof props === 'string') { try { props = JSON.parse(props) } catch { props = {} } }
        if (props == null || typeof props !== 'object') {
          // Allow flat shorthand: ui_set with text/color/value/visible directly.
          props = {}
          for (const k of ['text', 'color', 'value', 'max', 'visible', 'tint', 'prefab', 'tex', 'atlas', 'label']) {
            if (actionData[k] !== undefined) props[k] = actionData[k]
          }
        }
        cmd = { action: 'set', id: actionData.id, node: actionData.node, props }
      } else if (actionType === 'ui_progress_bar') {
        const val = Number(actionData.value) || 0
        const max = Number(actionData.max) || 1
        cmd = { action: 'create', id: actionData.id || `bar_${Date.now()}`, type: 'progress_bar', value: val / max, label: actionData.label, width: Number(actionData.width) || 200 }
      } else if (actionType === 'ui_menu') {
        // Menu = panel + N buttons laid out vertically. Buttons come as a JSON
        // array of { label, callback } (or { text, callback }). Each button's
        // click sends back a `ui_callback` event carrying its `callback` string.
        const menuId = actionData.id || `menu_${Date.now()}`
        let buttons = actionData.buttons
        if (typeof buttons === 'string') {
          try { buttons = JSON.parse(buttons) } catch { buttons = [] }
        }
        if (!Array.isArray(buttons)) buttons = []

        const width = Number(actionData.width) || 360
        const btnH = 46
        const headerH = actionData.title || actionData.body ? 70 : 20
        const height = Number(actionData.height) || (headerH + buttons.length * (btnH + 8) + 20)
        const anchor = actionData.anchor || 'center'

        // All widgets of one menu share `group: menuId` so closing the panel
        // (or a destroy_group) tears the whole menu down, not just the panel.
        const sub: any[] = [
          { action: 'create', id: menuId, group: menuId, type: 'panel', title: actionData.title, body: actionData.body, width, height, anchor, closeable: actionData.closeable !== false && actionData.closeable !== 'false' },
        ]
        // Stack buttons downward from just under the header.
        let y = height / 2 - headerH - btnH / 2
        buttons.forEach((b: any, i: number) => {
          const label = b.label ?? b.text ?? `Opção ${i + 1}`
          const callback = b.callback ?? b.value ?? label
          sub.push({ action: 'create', id: `${menuId}_btn_${i}`, group: menuId, type: 'button', text: String(label), callback: String(callback), width: width - 40, height: btnH, anchor, y, x: 0 })
          y -= btnH + 8
        })
        // seq lets the client dedup a re-delivered batch (net_string replays).
        cmd = { action: 'batch', seq: Date.now(), commands: sub }
      } else if (actionType === 'ui_track') {
        // HUD that follows a world entity (e.g. health bar over a boss).
        // The mod resolves the entity client-side and repositions each tick.
        // Delivered as a normal widget create with a `follow` block the mod reads.
        cmd = {
          action: 'create',
          id: actionData.id || `track_${Date.now()}`,
          type: actionData.widget || 'progress_bar',
          follow: {
            mode: actionData.mode || undefined,  // 'combat_target' = segue quem você ataca
            prefab: actionData.prefab || undefined,
            guid: actionData.guid ? Number(actionData.guid) : undefined,
            nearest: actionData.nearest === true || actionData.nearest === 'true',
            offset_y: Number(actionData.offset_y) || 60,
            max_dist: Number(actionData.max_dist) || 0,
            bind: actionData.bind || undefined,
          },
          label: actionData.label,
          width: Number(actionData.width) || 80,
          height: Number(actionData.height) || 10,
          value: Number(actionData.value) || 1,
          max: Number(actionData.max) || 1,
          text: actionData.text,
        }
        // optional color [r,g,b,a] as JSON string
        if (typeof actionData.color === 'string' && actionData.color.trim().startsWith('[')) {
          try { cmd.color = JSON.parse(actionData.color) } catch { /* ignore */ }
        } else if (Array.isArray(actionData.color)) {
          cmd.color = actionData.color
        }
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

  // ─── AI Agent node ─────────────────────────────────
  // Runs the agentic loop. Tools are the nodes wired to this node's `tools` input;
  // the model fills params and we execute the real node via the same pipeline.
  // Extracted so both the legacy processNode branch and the registry handler share
  // one implementation.
  private runAiAgentNode(
    node: FlowNode,
    nodes: FlowNode[],
    edges: FlowEdge[],
    context: Record<string, any>,
    serverId: string,
  ): Promise<any> {
    return executeAIAgent(node, nodes, edges, context, {
      resolve: (tpl, ctx) => this.resolveValue(tpl, ctx),
      runTool: (toolNode, args, ctx) => {
        // ai_memory: the AI's own key/value store. It picks operation + key
        // (free-form, e.g. "player:joe:house" or "server:pvp") + value.
        if (toolNode.type === 'ai_memory') {
          return this.runAiMemory(serverId, ctx, args)
        }
        // Merge: AI-provided args override the node's configured params, then
        // run it through the SAME action pipeline (resolveValue + coerce +
        // pushCommand). A scoped clone keeps the original node untouched.
        const merged: FlowNode = { ...toolNode, data: { ...toolNode.data, params: { ...(toolNode.data?.params || {}), ...args } } }
        const tt = merged.data.action_type || merged.type
        if (tt === 'http_request') return this.executeHttpRequest(merged, ctx)
        if (tt === 'set_variable') return this.executeSetVariable(merged, ctx)
        if (tt === 'script') return this.executeScript(merged, ctx, serverId)
        this.runFlowAction(serverId, merged, ctx)
        return { executed: true, action: tt }
      },
      // Conversation history, persisted per-flow under "aichat:<scopeKey>".
      loadHistory: (scopeKey: string) => {
        const flowId = String(context._flowId || '')
        if (!flowId) return []
        const v = new FlowMemoryRepository(serverId).get(flowId, `aichat:${scopeKey}`)
        return Array.isArray(v) ? v : []
      },
      saveHistory: (scopeKey: string, turns: any[]) => {
        const flowId = String(context._flowId || '')
        if (!flowId) return
        new FlowMemoryRepository(serverId).set(flowId, `aichat:${scopeKey}`, turns)
      },
    })
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

  // ─── ai_memory tool executor ────────────────────────
  // The AI's own key/value store, used as a tool by the ai_agent node. The model
  // picks the operation and a FREE-FORM key (e.g. "player:joe:house", "server:pvp")
  // so it can decide the scope itself. Persisted per-flow via FlowMemoryRepository,
  // namespaced under "aimem:" so it never collides with the memory node or the
  // chat-history keys. Returns a small JSON result the model can read back.
  private runAiMemory(serverId: string, context: Record<string, any>, args: Record<string, any>): any {
    const flowId = String(context._flowId || '')
    if (!flowId) return { ok: false, error: 'no flow context' }
    const op = String(args.operation || args.op || '').toLowerCase()
    const key = args.key != null ? String(args.key) : ''
    const NS = 'aimem:'
    const repo = new FlowMemoryRepository(serverId)
    try {
      switch (op) {
        case 'save':
        case 'set': {
          if (!key) return { ok: false, error: 'key required' }
          repo.set(flowId, NS + key, args.value ?? null)
          return { ok: true, op: 'save', key }
        }
        case 'get':
        case 'read': {
          if (!key) return { ok: false, error: 'key required' }
          const value = repo.get(flowId, NS + key)
          return { ok: true, op: 'get', key, value: value ?? null, found: value !== undefined }
        }
        case 'list': {
          // List keys (optionally filtered by prefix), without dumping every value.
          const all = repo.getAll(flowId)
          const prefix = key // "list" can pass a key as a prefix filter
          const items = Object.keys(all)
            .filter(k => k.startsWith(NS))
            .map(k => k.slice(NS.length))
            .filter(k => !prefix || k.startsWith(prefix))
          return { ok: true, op: 'list', keys: items }
        }
        case 'delete':
        case 'del': {
          if (!key) return { ok: false, error: 'key required' }
          repo.delete(flowId, NS + key)
          return { ok: true, op: 'delete', key }
        }
        default:
          return { ok: false, error: `unknown operation "${op}". Use save|get|list|delete.` }
      }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
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
      // Mask: a script can throw with a resolved secret embedded in the message.
      console.error(`[DSTP Script] Error:`, maskSecrets(String(err?.message ?? err), context))
      return { error: err.message }
    }
  }

  // ─── Auto-enable event categories ──────────────────

  ensureEventCategories(flow: any) {
    const categoryMap: Record<string, string> = {
      player_spawn: 'players', player_left: 'players', player_death: 'players',
      player_ghost: 'players', player_respawn: 'players', player_disconnected: 'players',
      player_new_character: 'players', player_resurrected: 'players', player_migrated: 'players',
      structure_burnt: 'griefing', structure_hammered: 'griefing',
      container_opened: 'griefing', container_closed: 'griefing',
      chat_message: 'chat', command: 'chat',
      new_day: 'world', phase_changed: 'world', season_changed: 'world',
      moon_phase_changed: 'world', earthquake: 'world', sinkhole_warn: 'world',
      world_save: 'world', player_teleported: 'world', rift_spawned: 'world',
      player_kill: 'combat', player_attacked: 'combat',
      player_attack_other: 'combat', player_hit_other: 'combat',
      player_block: 'combat', player_attack_miss: 'combat',
      player_min_health: 'combat', player_combat_target: 'combat',
      boss_warning: 'bosses',
      player_on_fire: 'survival', player_fire_out: 'survival',
      player_item_get: 'inventory', inventory_full: 'inventory', trade_received: 'inventory',
      player_craft: 'crafting', player_build: 'crafting',
      recipe_unlocked: 'crafting', tech_tree_changed: 'crafting',
      player_equip: 'inventory', player_pickup: 'inventory', player_drop: 'inventory', player_unequip: 'inventory',
      storm_changed: 'weather', precipitation: 'weather', lightning_strike: 'weather',
      boss_event: 'bosses', boss_killed: 'bosses',
      hound_warning: 'bosses',
      player_eat: 'survival', player_insane: 'survival', player_sane: 'survival',
      player_starving: 'survival', player_fed: 'survival',
      player_freezing: 'survival', player_cooled: 'survival',
      player_overheating: 'survival', player_warm: 'survival',
      player_mounted: 'survival', player_dismounted: 'survival',
      player_enlightened: 'survival', player_lunacy_normal: 'survival', player_wet: 'survival',
      player_work: 'gathering', resource_gathered: 'gathering', player_harvest: 'gathering', player_startfire: 'gathering',
      player_pick: 'gathering', player_mine_chop_start: 'gathering',
      health_delta: 'health', hunger_delta: 'health', sanity_delta: 'health',
      recipe_learned: 'character', character_transform: 'character',
      player_sleep_start: 'character', player_sleep_end: 'character',
      player_sunk: 'exploration', fish_caught: 'exploration',
    }

    const needed = new Set<string>()
    for (const node of flow.nodes || []) {
      if (node.type === 'trigger' && categoryMap[node.data.event_type]) {
        needed.add(categoryMap[node.data.event_type])
      }
    }
    // NOTE: key_pressed is intentionally NOT in categoryMap. Keys are not a DST
    // event category (no Lua listener gates on them) — they're a parallel channel
    // reconciled by collectWatchKeys() below.

    for (const cat of needed) {
      this.host.requestEventToggle(flow.server_id, cat, true)
    }
  }

  // Scan ALL enabled flows of a server for key_pressed triggers and tell the host
  // the FULL set of keys the client should watch. Unlike ensureEventCategories
  // (per-flow, additive), this is server-wide and recomputed from scratch on every
  // save/delete/toggle — so removing a key flow shrinks the watch set. The host
  // (DSTStateStore) only re-sends to the game when the set actually changes.
  collectWatchKeys(serverId: string) {
    const keys = new Set<string>()
    for (const flow of this.flowRepo(serverId).findEnabled()) {
      for (const node of (flow.nodes as FlowNode[]) || []) {
        if (node.type === 'trigger' && node.data.event_type === 'key_pressed') {
          const k = String(this.param(node, 'key') ?? '').toUpperCase().trim()
          if (k !== '') keys.add(k)
        }
      }
    }
    this.host.requestWatchKeys(serverId, [...keys])
  }
}
