import type { NodeHandler } from '@server/live/nodes/types'

export const handler: NodeHandler = async (rc) => {
  const userid = rc.resolve(rc.param('userid'))
  if (!userid) { rc.setContext({ error: 'no userid provided' }); return 'continue' }
  const p = rc.findPlayerInServer((pl) => pl.userid === userid)
  if (!p) { rc.setContext({ error: 'player not found', userid }); return 'continue' }
  const inv = p.inventory || {}
  rc.setContext({ items: inv.items || {}, equips: inv.equips || {}, backpack: inv.backpack || null, userid })
  return 'continue'
}
