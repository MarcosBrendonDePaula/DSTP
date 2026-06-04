// Builds ONE server's panel-room state ({ server, players, events }) from the
// in-memory store. Shared by ServerRoom.onJoin (populate immediately when a panel
// joins) and LiveDSTP.pushServerRoom (push on every /dst/sync). Returns null if the
// server isn't known yet.

import { dstStateStore } from '../services/DSTStateStore'

export interface ServerRoomSnapshot {
  server: any
  players: Record<string, any>
  events: any[]
}

export function buildServerRoomState(serverId: string): ServerRoomSnapshot | null {
  const g = dstStateStore.getServerGroups().find(x => x.server_id === serverId)
  if (!g) return null
  const server = {
    server_id: g.server_id,
    name: g.name || g.server_id,
    online: g.online,
    last_seen: g.last_seen,
    player_count: g.all_players.length,
    active_events: dstStateStore.getActiveEvents(g.server_id),
    debounce: dstStateStore.getDebounce(g.server_id),
    shards: g.shards.map(s => ({
      shard_id: s.shard_id,
      shard_type: s.shard_type,
      online: s.online,
      day: s.server?.day,
      season: s.server?.season,
      phase: s.server?.phase,
      is_cave: s.server?.is_cave,
      max_players: s.server?.max_players,
      time_scale: s.server?.time_scale,
      player_count: s.players.length,
    })),
  }
  const players: Record<string, any> = {}
  for (const p of g.all_players) players[p.userid] = p
  return { server, players, events: dstStateStore.getEventsForServer(serverId) }
}
