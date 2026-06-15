import type { NodeHandler } from '@server/live/nodes/types'

export const handler: NodeHandler = async (rc) => {
  const g = rc.getServerGroup()
  const players = g ? g.all_players : []
  rc.setContext({ players, userids: players.map(p => p.userid), count: players.length })
  return 'continue'
}
