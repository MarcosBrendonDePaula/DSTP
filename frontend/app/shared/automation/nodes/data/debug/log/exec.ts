import type { NodeHandler } from '@server/live/nodes/types'

// Log a (template-resolved) message to the server log and to this node's output.
// Pure debug — does not change the flow. Secrets are masked by rc.log.
export const handler: NodeHandler = async (rc) => {
  const message = String(rc.resolve(rc.param('message')) ?? '')
  rc.log(message)
  rc.setContext({ message })
  return 'continue'
}
