import type { NodeHandler } from '@server/live/nodes/types'

// Output = the node's params bag with each value resolved (no coercion). Mirrors
// the legacy `setContext(node.id, executeSetVariable(node, context))`.
export const handler: NodeHandler = async (rc) => {
  rc.setContext(rc.executeSetVariable())
  return 'continue'
}
