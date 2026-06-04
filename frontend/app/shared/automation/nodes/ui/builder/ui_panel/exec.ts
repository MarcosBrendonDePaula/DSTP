import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy ui_panel branch: walk the ui_* child subgraph into a tree,
// push one ui_command, and return 'stop' — its out-edges are children, NOT the
// next action, so we do NOT follow them.
export const handler: NodeHandler = async (rc) => {
  const tree = rc.buildUITree()
  const userid = rc.resolve(rc.param('userid', ''))
  const uiId = rc.uiNodeId()
  const payload: any = { id: uiId, group: uiId, tree, anchor: rc.param('anchor', 'center'), seq: Date.now() }
  if (userid) {
    rc.pushCommand('ui_command', { userid, cmd: { action: 'create', type: 'tree', ...payload } })
  }
  rc.setContext({ rendered: true, tree })
  return 'stop'
}
