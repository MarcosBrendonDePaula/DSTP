import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy ui_builder branch: resolve the whole tree, push a ui_command
// tree-create to the player, then CONTINUE the action chain (unlike ui_panel).
export const handler: NodeHandler = async (rc) => {
  const uiId = rc.uiNodeId()
  const userid = rc.resolve(rc.param('userid', ''))
  // Entered via the "close" input handle → DESTROY this UI for the player instead of
  // rendering it (an event-driven close, same idea as the repaint input).
  const incoming = (rc as any).context?._incomingHandle
  if (incoming === 'close') {
    if (userid) {
      rc.pushCommand('ui_command', { userid, cmd: { action: 'destroy', type: 'tree', id: uiId, group: uiId, seq: Date.now() } })
    }
    rc.setContext({ closed: true })
    return { followEdges: (edge: any) => !String(edge.sourceHandle || '').startsWith('cb:') }
  }
  const tree = rc.resolveTree(rc.node.data.tree || {})
  if (userid) {
    rc.pushCommand('ui_command', {
      userid,
      cmd: { action: 'create', type: 'tree', id: uiId, group: uiId, tree, anchor: rc.param('anchor', 'center'), seq: Date.now() },
    })
  }
  rc.setContext({ rendered: true })
  // Follow the normal "continua" output, but NOT the `cb:<callback>` handles — those are
  // EVENT outputs, fired only when the player actually clicks (via evaluateEvent's
  // _startHandle). Following them here would loop (repaint → cb → repaint → …).
  return { followEdges: (edge: any) => !String(edge.sourceHandle || '').startsWith('cb:') }
}
