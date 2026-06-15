import type { NodeHandler } from '@server/live/nodes/types'

export const handler: NodeHandler = async (rc) => {
  const g = rc.getServerGroup()
  if (!g) { rc.setContext({ error: 'server not known' }); return 'continue' }
  // Prefer the master shard's server info (overworld).
  const master = g.shards.find(s => s.shard_type === 'master') || g.shards[0]
  const s = master?.server || {}
  rc.setContext({
    day: s.day, season: s.season, phase: s.phase,
    current_players: s.current_players ?? g.all_players.length,
    max_players: s.max_players, uptime: s.uptime, time_scale: s.time_scale,
    is_dedicated: s.is_dedicated, name: g.name || s.name, online: g.online,
  })
  return 'continue'
}
