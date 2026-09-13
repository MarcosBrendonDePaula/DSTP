import type { NodeHandler } from '@server/live/nodes/types'

// ui_track: a HUD widget that follows world entities. Its out-edges are TWO kinds:
//   * ui_* children  → the per-entity TEMPLATE (rendered by the client for each entity
//                      it tracks; their `bind` props are evaluated locally every frame)
//   * anything else  → the next actions, followed as usual (unlike ui_panel, which
//                      consumes all its edges as children)
export const handler: NodeHandler = async (rc) => {
  const isUi = (id: string) => !!rc.nodes.find(n => n.id === id)?.type.startsWith('ui_')
  let template: any = undefined
  if (rc.edges.some(e => e.source === rc.node.id && isUi(e.target))) {
    // buildUITree(this node) yields { type:'track', children:[...] }: one child = the
    // template itself; several = stacked in a column.
    const t = rc.buildUITree()
    const kids: any[] = Array.isArray(t?.children) ? t.children : []
    template = kids.length === 1 ? kids[0] : kids.length > 1 ? { type: 'col', gap: 2, children: kids } : undefined
  }
  rc.runFlowAction(template ? { template } : undefined)
  rc.setContext({ executed: true, action: 'ui_track', template: !!template })
  rc.executedActions.push('ui_track')
  return { followEdges: (e) => !isUi(e.target) }
}
