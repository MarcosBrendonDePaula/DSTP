import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy condition branch: evaluate, store {result, field, value},
// then follow ONLY the matching true/false edge (returned as a followEdges filter
// so the dispatcher traces before following, like the legacy did).
export const handler: NodeHandler = async (rc) => {
  const result = rc.evaluateCondition()
  rc.setContext({ result, field: rc.node.data.field, value: rc.node.data.value })
  return {
    // Follow the matching branch. An edge with NO handle (legacy default wiring) is
    // treated as the true branch for back-compat; but an unrecognized, non-empty
    // handle (a typo like 'banana', or a stray edge) is NOT followed — otherwise it
    // would fire on every true result (fail-open). Only true/false/no-handle count.
    followEdges: (edge) => {
      const h = edge.sourceHandle
      if (h === 'true') return result
      if (h === 'false') return !result
      if (h == null || h === '') return result // legacy unlabeled edge → true branch
      return false // unknown handle → don't follow
    },
  }
}
