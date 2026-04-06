import { Elysia } from "elysia"
import { dstStateStore } from "../services/DSTStateStore"
import { processAutomationEvent } from "../live/LiveAutomation"
import { EventHistoryRepository, EventSchemaRepository } from "../db"

setInterval(() => dstStateStore.checkHealth(), 15000)

export const dstRoutes = new Elysia({ prefix: "/dst" })
  .onError(({ code, error, path }) => {
    if (code !== 'PARSE') console.error(`[DSTP Route Error] ${path} code=${code}:`, error)
  })
  // Custom parser: DST's TheSim:QueryServer may send bodies without proper Content-Type
  .onParse(async ({ request, contentType }) => {
    if (request.url.includes('/dst/sync')) {
      const text = await request.text()
      // DST's json.encode escapes single quotes as \' which is invalid JSON — fix it
      const fixed = text.replace(/\\'/g, "'")
      try { return JSON.parse(fixed) } catch (e) { console.error('[DSTP Sync] JSON parse failed, first 300 chars:', fixed.substring(0, 300)); return null }
    }
  })
  .post("/sync", ({ body }) => {
    // Body may arrive as string if DST sends non-JSON content-type
    let data: any = body
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch { return { error: 'invalid json' } }
    }
    const { server_id, shard_id, shard_type, server, players, events, active_events, debounce } = data

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

    // Process events: persist to DB + auto-detect schema + automation engine
    if (events && events.length > 0) {
      const eventRepo = new EventHistoryRepository(server_id)
      const schemaRepo = new EventSchemaRepository(server_id)
      for (const evt of events) {
        try { eventRepo.create({ type: evt.type, shardId: shard_id, shardType: shard_type, data: evt.data || {} }) } catch (e) { /* */ }
        try { schemaRepo.autoDetect(evt.type, evt.data || {}) } catch (e) { /* */ }
        try { processAutomationEvent(server_id, evt) } catch (e) { console.error('[DSTP Automation] Event processing error:', e) }

        // If event has raw dump data, save to file
        if (evt.raw) {
          const fs = require('fs')
          const path = require('path')
          const dumpDir = path.join(process.cwd(), 'data', 'event_dumps')
          if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true })

          const entry = {
            type: evt.type,
            timestamp: Date.now(),
            data: evt.data,
            raw: evt.raw,
            server_id,
            shard_id,
          }

          // Append to a single dump file per event type
          const filePath = path.join(dumpDir, `${evt.type}.jsonl`)
          fs.appendFileSync(filePath, JSON.stringify(entry) + '\n')
        }
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

  .get("/players", ({ query }) => {
    const serverId = (query as any)?.server_id
    const groups = dstStateStore.getServerGroups()
    const players: any[] = []
    for (const g of groups) {
      if (serverId && g.server_id !== serverId) continue
      for (const p of g.all_players) {
        players.push({ ...p, server_id: g.server_id })
      }
    }
    return players
  }, {
    detail: { tags: ['DST'], summary: 'List online players' }
  })

  .get("/dumps", () => {
    const fs = require('fs')
    const path = require('path')
    const dumpDir = path.join(process.cwd(), 'data', 'event_dumps')
    if (!fs.existsSync(dumpDir)) return []
    return fs.readdirSync(dumpDir).filter((f: string) => f.endsWith('.jsonl')).map((f: string) => {
      const stats = fs.statSync(path.join(dumpDir, f))
      return { file: f, type: f.replace('.jsonl', ''), size: stats.size, modified: stats.mtimeMs }
    })
  }, {
    detail: { tags: ['DST'], summary: 'List event dump files' }
  })

  .get("/dumps/:type", ({ params }) => {
    const fs = require('fs')
    const path = require('path')
    const filePath = path.join(process.cwd(), 'data', 'event_dumps', `${params.type}.jsonl`)
    if (!fs.existsSync(filePath)) return []
    return fs.readFileSync(filePath, 'utf8').trim().split('\n').map((line: string) => JSON.parse(line))
  }, {
    detail: { tags: ['DST'], summary: 'Get dump entries for an event type' }
  })

  .post("/dump-mode", ({ body }) => {
    const { server_id, enabled } = body as any
    if (!server_id) return { error: 'missing server_id' }
    dstStateStore.pushCommandToServer(server_id, 'set_dump_mode', { enabled: !!enabled })
    return { ok: true, dump_mode: !!enabled }
  }, {
    detail: { tags: ['DST'], summary: 'Toggle dump mode on a DST server' }
  })

  .post("/command", ({ body }) => {
    const { server_id, type, data } = body as any
    if (!server_id || !type) return { error: 'missing server_id or type' }
    dstStateStore.pushCommandToServer(server_id, type, data || {})
    return { ok: true, command: type }
  }, {
    detail: { tags: ['DST'], summary: 'Send command to DST server' }
  })

  .get("/debug/queues", () => {
    // Debug endpoint to check command queues
    return { store_version: dstStateStore.version }
  })
