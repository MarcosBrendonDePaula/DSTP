// Execution contract for flow node handlers (the exec.ts of each node module).
//
// A handler receives a NodeRunContext — everything it needs to do its work,
// injected by the engine so the handler never touches FlowEngine internals
// directly. The handler does ONLY the node's own logic and returns one of:
//   - 'continue'        → engine traces the node and follows its out-edges
//   - 'stop'            → engine traces the node but does NOT follow edges (ui_panel)
//   - { wait: FlowNode } → bubble a paused wait node up the recursion
// Tracing (traceCompleted) and the default edge-follow are centralized in the
// engine dispatcher, so handlers stay small and consistent.
import type { FlowNode, FlowEdge } from '../../db'

export type HandlerResult = 'continue' | 'stop' | { wait: FlowNode }

export interface NodeRunContext {
  // ── The node and its graph ──
  node: FlowNode
  nodes: FlowNode[]
  edges: FlowEdge[]
  context: Record<string, any>
  serverId: string
  executedActions: string[]
  stopAtWait: boolean

  // ── Core helpers (today private on FlowEngine) ──
  /** Resolve {{...}} templates against the current context. */
  resolve: (template: any) => any
  /** Read this node's param: params?.[key] ?? data[key] ?? def. */
  param: (key: string, def?: any) => any
  /** Write this node's output to context[node.id] (+ alias). */
  setContext: (value: any) => void
  /** Find a player in this server's shard group. */
  findPlayerInServer: (predicate: (p: any) => boolean) => any | null
  /** Evaluate this node's condition config. */
  evaluateCondition: () => boolean

  // ── Edge following (for nodes that control their own flow, e.g. condition) ──
  /** Follow this node's out-edges (optionally filtered). Returns a bubbled wait
   *  node or null. Most handlers DON'T call this — they return 'continue' and let
   *  the dispatcher follow edges. condition calls it with a true/false filter. */
  followOutEdges: (filter?: (edge: FlowEdge) => boolean) => Promise<FlowNode | null>

  // ── Side-effects / heavy helpers (stay in the engine, injected here) ──
  pushCommand: (type: string, data: any) => void
  runFlowAction: () => void
  executeHttpRequest: () => Promise<any>
  executeSetVariable: () => any
  executeScript: () => Promise<any>
  runAiMemory: (args: Record<string, any>) => any
  buildUITree: () => any
  resolveTree: (tree: any) => any
  /** Run the AI agent for this node (callbacks built by the engine). */
  executeAIAgent: () => Promise<any>
}

export type NodeHandler = (rc: NodeRunContext) => Promise<HandlerResult>

/** What a node module's exec.ts exports. Triggers omit this (no execution). */
export interface NodeExecModule {
  handler: NodeHandler
}
