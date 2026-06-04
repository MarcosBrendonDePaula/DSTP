import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy ui_builder branch: resolve the whole tree, push a ui_command
// tree-create to the player, then CONTINUE the action chain (unlike ui_panel).
export const handler: NodeHandler = async (rc) => {
  const tree = rc.resolveTree(rc.node.data.tree || {})
  const uiId = rc.uiNodeId()
  const userid = rc.resolve(rc.param('userid', ''))
  if (userid) {
    rc.pushCommand('ui_command', {
      userid,
      cmd: { action: 'create', type: 'tree', id: uiId, group: uiId, tree, anchor: rc.param('anchor', 'center'), seq: Date.now() },
    })
  }
  rc.setContext({ rendered: true })
  return 'continue'
}
