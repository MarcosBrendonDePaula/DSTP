import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy script branch. executeScript runs run(context) in the
// admin-only sandbox; we record the action like the legacy did.
export const handler: NodeHandler = async (rc) => {
  rc.setContext(await rc.executeScript())
  rc.executedActions.push('script')
  return 'continue'
}
