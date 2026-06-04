import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy http_request branch. executeHttpRequest does the fetch +
// template resolution; we record the action like the legacy did.
export const handler: NodeHandler = async (rc) => {
  rc.setContext(await rc.executeHttpRequest())
  rc.executedActions.push('http_request')
  return 'continue'
}
