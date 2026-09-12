import type { NodeHandler } from '@server/live/nodes/types'
import { htmlToNode } from '@server/live/ui/htmlToNode'

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
  // Runtime HTML (task 11): `html` param (e.g. {{myscript.html}}) wins over the static
  // tree — parsed on the backend (jsdom) into the tree the client renders. Templates
  // resolve before parsing. Invalid HTML falls back to the static tree + `error`.
  let tree: any
  let htmlError: string | undefined
  const runtimeHtml = String(rc.resolve(rc.param('html', '')) ?? '').trim()
  if (runtimeHtml) {
    try { tree = await htmlToNode(runtimeHtml) }
    catch (err: any) { htmlError = String(err?.message ?? err) }
  }
  if (!tree) tree = rc.resolveTree(rc.node.data.tree || {})
  if (userid) {
    // Position: percent model (pct_x/pct_y) takes priority; else the legacy anchor.
    // Only forward pct_* when both are set, so anchor-only flows are untouched.
    const pctXraw = rc.param('pct_x', '')
    const pctYraw = rc.param('pct_y', '')
    const hasPct = pctXraw !== '' && pctXraw != null && pctYraw !== '' && pctYraw != null
    const cmd: any = {
      action: 'create', type: 'tree', id: uiId, group: uiId, tree,
      x: Number(rc.param('offset_x', 0)) || 0, y: Number(rc.param('offset_y', 0)) || 0,
      seq: Date.now(),
    }
    if (hasPct) { cmd.pct_x = Number(pctXraw) || 0; cmd.pct_y = Number(pctYraw) || 0 }
    else { cmd.anchor = rc.param('anchor', 'center') }
    rc.pushCommand('ui_command', { userid, cmd })
  }
  rc.setContext(htmlError ? { rendered: true, error: htmlError } : { rendered: true })
  // Follow the normal "continua" output, but NOT the `cb:<callback>` handles — those are
  // EVENT outputs, fired only when the player actually clicks (via evaluateEvent's
  // _startHandle). Following them here would loop (repaint → cb → repaint → …).
  return { followEdges: (edge: any) => !String(edge.sourceHandle || '').startsWith('cb:') }
}
