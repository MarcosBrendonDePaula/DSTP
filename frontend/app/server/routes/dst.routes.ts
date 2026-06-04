import { Elysia, t } from "elysia"
import { dstStateStore } from "../services/DSTStateStore"
import { processAutomationEvent } from "../live/LiveAutomation"
import { EventHistoryRepository, EventSchemaRepository } from "../db"
import { announceSetupTokenIfNeeded } from "../services/PanelAuthStore"
import { syncRecorder } from "../services/SyncRecorder"

setInterval(() => dstStateStore.checkHealth(), 15000)

// Core sync logic, shared between HTTP POST /dst/sync and the WebSocket relay.
// Returns the exact response shape the mod expects (`{ commands, enable_events?, debounce? }`).
export function handleDstSync(data: any) {
  const { server_id, shard_id, shard_type, server, players, events, active_events, debounce } = data
  if (!server_id || !shard_id) return { error: 'missing server_id or shard_id' }

  // Dev replay recorder — no-op unless a session is active (DSTP_RECORD).
  syncRecorder.record({ server_id, shard_id, shard_type, server, players, events, active_events })

  announceSetupTokenIfNeeded(server_id)

  const result = dstStateStore.handleSync(
    server_id,
    shard_id,
    shard_type || 'master',
    server,
    players || [],
    events || [],
    active_events,
    debounce,
  )

  try { (require("../live/LiveDSTP") as any).notifyLiveDSTP?.() } catch {}

  if (events && events.length > 0) {
    const eventRepo = new EventHistoryRepository(server_id)
    const schemaRepo = new EventSchemaRepository(server_id)
    for (const evt of events) {
      try { eventRepo.create({ type: evt.type, shardId: shard_id, shardType: shard_type, data: evt.data || {} }) } catch {}
      try { schemaRepo.autoDetect(evt.type, evt.data || {}) } catch {}
      try { processAutomationEvent(server_id, evt) } catch (e) { console.error('[DSTP Automation]', e) }

      if (evt.raw) {
        const fs = require('fs')
        const path = require('path')
        const dumpDir = path.join(process.cwd(), 'data', 'event_dumps')
        if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true })
        const entry = { type: evt.type, timestamp: Date.now(), data: evt.data, raw: evt.raw, server_id, shard_id }
        fs.appendFileSync(path.join(dumpDir, `${evt.type}.jsonl`), JSON.stringify(entry) + '\n')
      }
    }
  }

  // Synthetic `tick` event per player — gives flows a periodic heartbeat for
  // live HUDs (position/world don't arrive as events). Throttled per player so
  // a 0.1s poll doesn't run tick flows 10×/s.
  if (Array.isArray(players) && players.length > 0) {
    const now = Date.now()
    for (const p of players) {
      if (!p?.userid) continue
      const key = `${server_id}:${p.userid}`
      const last = _tickLast.get(key) || 0
      if (now - last < TICK_MS) continue
      _tickLast.set(key, now)
      const evt = { type: 'tick', data: {
        userid: p.userid, name: p.name,
        x: p.position?.x, y: p.position?.y, z: p.position?.z,
        health: p.health, hunger: p.hunger, sanity: p.sanity,
        day: server?.day, phase: server?.phase, season: server?.season,
      }}
      try { processAutomationEvent(server_id, evt) } catch (e) { console.error('[DSTP tick]', e) }
    }
  }

  return result
}

const TICK_MS = 1000
const _tickLast: Map<string, number> = ((globalThis as any).__dstpTickLast ??= new Map())

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
    let data: any = body
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch { return { error: 'invalid json' } }
    }
    return handleDstSync(data)
  }, {
    detail: { tags: ['DST'], summary: 'DST Shard Sync (HTTP)' },
  })

  // WebSocket relay endpoint. The DSTP relay process opens ONE persistent
  // connection here and tunnels sync requests through it. Protocol (JSON):
  //   Relay → Server: { id, type: "sync", data: <sync payload> }
  //   Server → Relay: { id, type: "sync.response", data: <response> }
  //   Server → Relay (push): { type: "command", shard_id, command }
  //     (fired as soon as a command is enqueued; relay buffers it locally
  //      so the next mod poll gets a sub-ms response.)
  .ws("/relay", {
    open(ws) {
      console.log('[DSTP Relay WS] connected')
      const unsubscribe = dstStateStore.onCommandQueued((shard_id, command) => {
        try {
          ws.send(JSON.stringify({ type: 'command', shard_id, command }))
        } catch (e) {
          // socket closing
        }
      })
      ;(ws.data as any).unsubscribe = unsubscribe
    },
    message(ws, raw) {
      let msg: any
      try {
        msg = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' }))
        return
      }
      if (!msg || !msg.type) return

      if (msg.type === 'sync') {
        const response = handleDstSync(msg.data || {})
        ws.send(JSON.stringify({ id: msg.id, type: 'sync.response', data: response }))
        return
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ id: msg.id, type: 'pong' }))
        return
      }
    },
    close(ws) {
      const unsubscribe = (ws.data as any)?.unsubscribe
      if (typeof unsubscribe === 'function') unsubscribe()
      console.log('[DSTP Relay WS] disconnected')
    },
  })

  // Dev replay recorder controls. Start/stop a capture session and inspect status.
  // Off by default; recording adds one disk-append per sync while active.
  .post("/record/start", ({ query }) => {
    const label = (query as any)?.label || 'session'
    const file = syncRecorder.start(String(label))
    return { recording: true, file }
  }, { detail: { tags: ['DST'], summary: 'Start replay recording' } })
  .post("/record/stop", () => {
    const { file, count } = syncRecorder.stop()
    return { recording: false, file, count }
  }, { detail: { tags: ['DST'], summary: 'Stop replay recording' } })
  .get("/record/status", () => ({
    recording: syncRecorder.isActive(),
    file: syncRecorder.sessionFile || null,
    count: syncRecorder.recorded,
  }), { detail: { tags: ['DST'], summary: 'Replay recording status' } })

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
