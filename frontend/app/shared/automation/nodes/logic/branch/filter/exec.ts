import type { NodeHandler } from '@server/live/nodes/types'

// Filter/guard: evaluate the condition; if it passes, continue the flow, else
// STOP (return 'stop' so no out-edges are followed). One output, no branching.
export const handler: NodeHandler = async (rc) => {
  const passed = rc.evaluateCondition()
  rc.setContext({ passed })
  return passed ? 'continue' : 'stop'
}
