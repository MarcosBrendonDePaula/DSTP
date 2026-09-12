import type { NodeHandler } from '@server/live/nodes/types'
import { handler as uiTrackHandler } from '../../interface/ui_track/exec'

// Mirrors the legacy generic-action branch: runFlowAction dispatches the command
// for node.data.action_type (heal/kick/ui_*/rule_*/...), then we record it.
export const handler: NodeHandler = async (rc) => {
  const actionType = rc.node.data.action_type || rc.node.type
  // A generic `action` node configured as ui_track (older flows) gets the dedicated
  // handler so its ui_* children become the per-entity template too.
  if (actionType === 'ui_track') return uiTrackHandler(rc)
  rc.runFlowAction()
  rc.setContext({ executed: true, action: actionType })
  rc.executedActions.push(actionType)
  return 'continue'
}
