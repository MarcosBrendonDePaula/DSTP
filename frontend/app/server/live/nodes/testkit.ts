// Test helper: build a NodeRunContext mock to unit-test a node's exec.ts handler
// in isolation (no FlowEngine). Used by the per-node *.test.ts files.
//
// `resolve` uses the REAL resolveValue so {{...}} templates behave exactly like in
// production. `param` mirrors the engine: params?.[key] ?? data[key] ?? def.
// setContext/pushCommand/log capture what the handler produced; the heavy helpers
// (executeHttpRequest, runFlowAction, …) default to no-op stubs you can override.
import type { NodeRunContext } from './types'
import type { FlowNode, FlowEdge } from '../../db'
import { resolveValue, evaluateCondition as evalCond } from '../expressions'

export type RcSpy = {
  rc: NodeRunContext
  /** The value passed to setContext (the node's output). */
  out: () => any
  /** Commands captured from pushCommand, in order. */
  commands: Array<{ type: string; data: any }>
  /** Lines captured from log(). */
  logs: string[]
}

export function makeRc(opts: {
  /** node.data — typically { params: {...}, action_type, ... }. */
  data?: Record<string, any>
  /** Initial context for {{...}} resolution. */
  context?: Record<string, any>
  serverId?: string
  nodes?: FlowNode[]
  edges?: FlowEdge[]
  /** Players returned by findPlayerInServer's predicate scan. */
  players?: any[]
  /** Override any heavy helper (executeHttpRequest, runFlowAction, …). */
  overrides?: Partial<NodeRunContext>
} = {}): RcSpy {
  const data = opts.data ?? {}
  const context = opts.context ?? {}
  const node: FlowNode = { id: 'n1', type: 't', data, position: { x: 0, y: 0 } } as any
  const commands: Array<{ type: string; data: any }> = []
  const logs: string[] = []
  let out: any

  const param = (key: string, def?: any) => {
    const p = (data as any).params
    if (p && p[key] !== undefined) return p[key]
    if ((data as any)[key] !== undefined) return (data as any)[key]
    return def
  }

  const rc: NodeRunContext = {
    node, nodes: opts.nodes ?? [node], edges: opts.edges ?? [], context,
    serverId: opts.serverId ?? `__unit_${Date.now()}`,
    executedActions: [], stopAtWait: false,
    resolve: (tpl) => resolveValue(tpl, context),
    param,
    setContext: (v) => { out = v; context[node.id] = v; if (data.alias) context[data.alias] = v },
    findPlayerInServer: (pred) => (opts.players ?? []).find(pred) ?? null,
    getServerGroup: () => (opts as any).serverGroup ?? { server_id: 'test', name: 'test', shards: [], all_players: opts.players ?? [], online: true },
    evaluateCondition: () => evalCond({ field: param('field'), operator: param('operator'), value: param('value') }, context),
    followOutEdges: async () => null,
    resetVisits: () => {},
    pushCommand: (type, d) => { commands.push({ type, data: d }) },
    log: (m) => { logs.push(m) },
    runFlowAction: () => {},
    executeHttpRequest: async () => ({}),
    executeSetVariable: () => ({}),
    executeScript: async () => ({}),
    runAiMemory: () => ({}),
    buildUITree: () => ({}),
    resolveTree: (tree) => tree,
    uiNodeId: () => `ui_${node.id}`,
    executeAIAgent: async () => ({}),
    ...opts.overrides,
  }

  return { rc, out: () => out, commands, logs }
}
