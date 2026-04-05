import { Elysia } from "elysia"
import { dstStateStore } from "../services/DSTStateStore"

setInterval(() => dstStateStore.checkHealth(), 15000)

export const dstRoutes = new Elysia({ prefix: "/dst" })
  .post("/sync", ({ body }) => {
    const { server_id, shard_id, shard_type, server, players, events, active_events } = body as any

    if (!server_id || !shard_id) {
      return { error: 'missing server_id or shard_id' }
    }

    const result = dstStateStore.handleSync(
      server_id,
      shard_id,
      shard_type || 'master',
      server,
      players || [],
      events || [],
      active_events
    )

    // Notify live component
    const { notifyLiveDSTP } = require("../live/LiveDSTP")
    notifyLiveDSTP?.()

    return result
  }, {
    detail: {
      tags: ['DST'],
      summary: 'DST Shard Sync',
    }
  })

  .get("/servers", () => {
    return dstStateStore.getServerGroups().map(g => ({
      server_id: g.server_id,
      name: g.name,
      shards: g.shards.length,
      players: g.all_players.length,
      online: g.online,
    }))
  }, {
    detail: { tags: ['DST'], summary: 'List servers' }
  })

  .get("/debug/queues", () => {
    // Debug endpoint to check command queues
    return { store_version: dstStateStore.version }
  })
