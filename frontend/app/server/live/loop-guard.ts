// Loop protection for flow execution.
//
// DSTP has no explicit loop node, so within a single execution a node should
// not run repeatedly: convergent branches may revisit a node a few times, but a
// cyclic graph (A→B→A) revisits it without bound. The PRIMARY signal is
// per-node repetition; a total-step cap is a secondary backstop for a
// pathological (huge but acyclic) graph.

export const MAX_NODE_VISITS = 50
export const MAX_TOTAL_STEPS = 1000

export interface LoopGuard {
  visits: Map<string, number>
  steps: number
  aborted: boolean
}

export function createLoopGuard(): LoopGuard {
  return { visits: new Map(), steps: 0, aborted: false }
}

export interface LoopGuardResult {
  /** true → keep executing this node; false → abort (guard tripped or already aborted). */
  ok: boolean
  /** Set when this call is the one that trips the guard. */
  tripped?: { reason: string; nodeId: string; visits: number; steps: number }
}

// Record one visit to `nodeId` and decide whether execution may continue.
// Mutates the guard (increments steps + per-node count, flips `aborted`).
export function recordVisit(
  guard: LoopGuard,
  nodeId: string,
  maxNodeVisits = MAX_NODE_VISITS,
  maxTotalSteps = MAX_TOTAL_STEPS,
): LoopGuardResult {
  if (guard.aborted) return { ok: false }

  guard.steps++
  const visits = (guard.visits.get(nodeId) || 0) + 1
  guard.visits.set(nodeId, visits)

  const cyclic = visits > maxNodeVisits
  const runaway = guard.steps > maxTotalSteps
  if (cyclic || runaway) {
    guard.aborted = true
    const reason = cyclic
      ? `node "${nodeId}" ran ${visits}x in one execution (cycle in the graph?)`
      : `flow exceeded ${maxTotalSteps} total steps`
    return { ok: false, tripped: { reason, nodeId, visits, steps: guard.steps } }
  }

  return { ok: true }
}
