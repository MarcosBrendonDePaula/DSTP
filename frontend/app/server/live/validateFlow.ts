// validateFlow — a pure, dependency-light check that a flow graph is well-formed
// BEFORE it is saved. Built primarily to gate AI-generated flows (the LLM can emit
// a typo'd node type, a dangling edge, or a branch handle the engine ignores), but
// also catches hand-built mistakes.
//
// ERROR = blocks save (the flow can't run correctly). WARNING = allowed but flagged.
// Rule severities + handle rules are transcribed from the engine (FlowEngine.ts,
// each branch node's exec.ts) and mirrored by meta.outputHandles — see
// output-handles.test.ts. The validator reads outputHandles so a new branching node
// is covered automatically once its meta declares them.

import { allNodeMetas } from './nodes/registry'
import type { FlowNode, FlowEdge } from '@server/db'

export interface ValidationIssue {
  rule: string
  severity: 'ERROR' | 'WARNING'
  nodeId?: string
  edgeId?: string
  message: string
}

export interface ValidationResult {
  ok: boolean // true when there are NO errors (warnings don't block)
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

const TRIGGER_TYPES = new Set(['trigger', 'webhook'])

// Valid output handles for a node, given its data. Static handles come from
// meta.outputHandles; switch's dynamic `case_<i>` expands to one per data.cases
// entry. A node with no declared handles allows only the unnamed edge (null/'').
function validHandlesFor(type: string, data: any, metaByType: Map<string, any>): Set<string> | null {
  const meta = metaByType.get(type)
  const declared = meta?.outputHandles as Array<{ id: string; dynamic?: boolean }> | undefined
  if (!declared || declared.length === 0) return null // single unnamed output

  const out = new Set<string>()
  for (const h of declared) {
    if (h.dynamic && h.id === 'case_<i>') {
      const cases = Array.isArray(data?.cases) ? data.cases : []
      for (let i = 0; i < cases.length; i++) out.add(`case_${i}`)
    } else if (h.dynamic) {
      // Unknown dynamic pattern (e.g. ui_builder cb:<name>) — can't enumerate here;
      // accept conservatively by returning null (don't false-positive on it).
      return null
    } else {
      out.add(h.id)
    }
  }
  return out
}

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const err = (rule: string, message: string, extra?: Partial<ValidationIssue>) =>
    errors.push({ rule, severity: 'ERROR', message, ...extra })
  const warn = (rule: string, message: string, extra?: Partial<ValidationIssue>) =>
    warnings.push({ rule, severity: 'WARNING', message, ...extra })

  const metaByType = new Map(allNodeMetas().map((m) => [m.type, m]))
  const knownType = (t: string) => metaByType.has(t) || t === 'wait'

  // ── nodes: ids, types ──────────────────────────────────────────────────────
  const nodeIds = new Set<string>()
  for (const n of nodes) {
    if (!n.id) { err('node.id', 'A node has no id.'); continue }
    if (nodeIds.has(n.id)) err('node.id.unique', `Duplicate node id: ${n.id}`, { nodeId: n.id })
    nodeIds.add(n.id)
    if (!n.type || !knownType(n.type)) {
      err('node.type', `Unknown node type "${n.type}".`, { nodeId: n.id })
    }
    if (!n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)) {
      warn('node.position', `Node ${n.id} has an invalid position (auto-layout will fix).`, { nodeId: n.id })
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // ── triggers: at least one entry, each configured ──────────────────────────
  const triggers = nodes.filter((n) => TRIGGER_TYPES.has(n.type))
  if (triggers.length === 0) {
    err('flow.trigger', 'Flow has no trigger or webhook entry point; it can never run.')
  }
  for (const t of triggers) {
    if (t.type === 'trigger') {
      const ev = t.data?.event_type
      if (!ev || String(ev).trim() === '') {
        err('trigger.event_type', `Trigger ${t.id} has no event_type.`, { nodeId: t.id })
      }
    }
  }

  // ── ui_builder must carry a non-empty tree (the AI tends to leave data:{}) ──
  for (const node of nodes) {
    if (node.type !== 'ui_builder') continue
    const tree: any = (node.data as any)?.tree
    const kids = tree?.children
    if (!tree || !tree.type || !Array.isArray(kids) || kids.length === 0) {
      err('ui_builder.tree', `ui_builder ${node.id} has no UI tree (data.tree with children). The panel would render empty.`, { nodeId: node.id })
    }
  }

  // ── edges: ids, endpoints, handles ─────────────────────────────────────────
  const edgeIds = new Set<string>()
  for (const e of edges) {
    if (e.id) {
      if (edgeIds.has(e.id)) err('edge.id.unique', `Duplicate edge id: ${e.id}`, { edgeId: e.id })
      edgeIds.add(e.id)
    }
    if (!nodeById.has(e.source)) {
      err('edge.source', `Edge ${e.id ?? ''} source "${e.source}" is not a node.`, { edgeId: e.id })
      continue
    }
    if (!nodeById.has(e.target)) {
      err('edge.target', `Edge ${e.id ?? ''} target "${e.target}" is not a node.`, { edgeId: e.id })
      continue
    }
    // sourceHandle must be valid for the source node's type.
    const src = nodeById.get(e.source)!
    const valid = validHandlesFor(src.type, src.data, metaByType)
    if (valid !== null) {
      const h = e.sourceHandle ?? ''
      // Branching nodes require a NAMED handle — an empty handle off a condition is
      // ambiguous. (condition's exec treats empty as the true branch for legacy
      // wiring, but AI output should be explicit, so warn rather than error.)
      if (h === '') {
        warn('edge.handle.empty', `Edge from ${src.type} ${src.id} has no sourceHandle (expected one of: ${[...valid].join(', ')}).`, { edgeId: e.id, nodeId: src.id })
      } else if (!valid.has(h)) {
        err('edge.handle', `Edge from ${src.type} ${src.id} uses handle "${h}" — not one of: ${[...valid].join(', ')}.`, { edgeId: e.id, nodeId: src.id })
      }
    }
  }

  // ── reachability + cycles (skip if structural errors already make it moot) ──
  if (triggers.length > 0 && nodeIds.size > 0) {
    const adj = new Map<string, string[]>()
    for (const e of edges) {
      if (nodeById.has(e.source) && nodeById.has(e.target)) {
        ;(adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target)
      }
    }
    // forward BFS from triggers → reachable set
    const reachable = new Set<string>()
    const queue = triggers.map((t) => t.id)
    while (queue.length) {
      const id = queue.shift()!
      if (reachable.has(id)) continue
      reachable.add(id)
      for (const nxt of adj.get(id) ?? []) queue.push(nxt)
    }
    for (const n of nodes) {
      if (!TRIGGER_TYPES.has(n.type) && !reachable.has(n.id)) {
        warn('node.unreachable', `Node ${n.id} (${n.type}) is unreachable from any trigger.`, { nodeId: n.id })
      }
    }

    // cycle detection (DFS white/grey/black). loop/foreach legitimately re-enter
    // their body subgraph at runtime, but the STATIC edges are still a DAG (the
    // body connects forward; the loop-back is runtime, not an edge), so a static
    // cycle is a real error.
    const WHITE = 0, GREY = 1, BLACK = 2
    const color = new Map<string, number>(nodes.map((n) => [n.id, WHITE]))
    let cycleNode: string | null = null
    const visit = (id: string): boolean => {
      color.set(id, GREY)
      for (const nxt of adj.get(id) ?? []) {
        const c = color.get(nxt)
        if (c === GREY) { cycleNode = nxt; return true }
        if (c === WHITE && visit(nxt)) return true
      }
      color.set(id, BLACK)
      return false
    }
    for (const n of nodes) {
      if (color.get(n.id) === WHITE && visit(n.id)) break
    }
    if (cycleNode) {
      err('flow.cycle', `Flow has a cycle (revisits node ${cycleNode}); the engine's loop-guard would abort it. Use a loop/foreach node for repetition.`, { nodeId: cycleNode })
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
