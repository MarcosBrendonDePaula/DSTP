import type { NodeHandler } from '@server/live/nodes/types'

export const handler: NodeHandler = async (rc) => {
  const userid = rc.resolve(rc.param('userid'))
  if (!userid) { rc.setContext({ error: 'no userid provided' }); return 'continue' }
  const p = rc.findPlayerInServer((pl) => pl.userid === userid)
  if (!p) { rc.setContext({ error: 'player not found', userid }); return 'continue' }
  const b = p.buffs || {}
  rc.setContext({
    moisture: b.moisture, temperature: b.temperature, is_ghost: b.is_ghost,
    is_beaver: b.is_beaver, mightiness: b.mightiness, is_starving: b.is_starving,
    in_combat: b.in_combat, combat_target: b.combat_target, userid,
  })
  return 'continue'
}
