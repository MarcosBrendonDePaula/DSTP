import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy condition branch: evaluate, store {result, field, value},
// then follow ONLY the matching true/false edge (returned as a followEdges filter
// so the dispatcher traces before following, like the legacy did).
export const handler: NodeHandler = async (rc) => {
  const result = rc.evaluateCondition()
  rc.setContext({ result, field: rc.node.data.field, value: rc.node.data.value })
  return {
    followEdges: (edge) =>
      edge.sourceHandle === 'true' ? result
        : edge.sourceHandle === 'false' ? !result
        : result,
  }
}
