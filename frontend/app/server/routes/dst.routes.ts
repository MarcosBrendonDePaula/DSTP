import { Elysia } from "elysia"
import { dstStateStore } from "../services/DSTStateStore"
import { processAutomationEvent } from "../live/LiveAutomation"
import { EventHistoryRepository } from "../db"

setInterval(() => dstStateStore.checkHealth(), 15000)

export const dstRoutes = new Elysia({ prefix: "/dst" })
  .post("/sync", ({ body }) => {
    const { server_id, shard_id, shard_type, server, players, events, active_events, debounce } = body as any

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
      active_events,
      debounce
    )

    // Notify live component
    const { notifyLiveDSTP } = require("../live/LiveDSTP")
    notifyLiveDSTP?.()

    // Process events: persist to DB + automation engine
    if (events && events.length > 0) {
      const eventRepo = new EventHistoryRepository(server_id)
      for (const evt of events) {
        try { eventRepo.create({ type: evt.type, shardId: shard_id, shardType: shard_type, data: evt.data || {} }) } catch (e) { /* */ }
        try { processAutomationEvent(server_id, evt) } catch (e) { /* don't break sync */ }
      }
    }

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
