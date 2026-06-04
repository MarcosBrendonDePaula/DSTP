import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy generic-action branch: runFlowAction dispatches the command
// for node.data.action_type (heal/kick/ui_*/rule_*/...), then we record it.
export const handler: NodeHandler = async (rc) => {
  const actionType = rc.node.data.action_type || rc.node.type
  rc.runFlowAction()
  rc.setContext({ executed: true, action: actionType })
  rc.executedActions.push(actionType)
  return 'continue'
}
