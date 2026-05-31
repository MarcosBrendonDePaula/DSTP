#!/usr/bin/env bun
/**
 * DSTP Relay — tiny HTTP proxy that bridges the DST mod to a remote DSTP
 * backend. The DST Lua sandbox only allows QueryServer() to 127.0.0.1 /
 * localhost and a hardcoded list of Klei domains, so the mod can't reach a
 * public backend directly. This relay listens on 127.0.0.1 (which passes the
 * sandbox check) and forwards every request to the configured upstream.
 *
 * Ships as a single self-contained executable. No install, no deps, double
 * click and go.
 *
 * Config precedence (highest to lowest):
 *   1. env vars DSTP_UPSTREAM / DSTP_PORT / DSTP_TOKEN
 *   2. dstp-relay.config.json next to the binary
 *   3. baked-in defaults at build time
 */

import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'

// ─── Baked defaults ─────────────────────────────────────────────────────
// Edit these before `bun run build:all` to embed your production upstream.
const BAKED_DEFAULTS = {
  upstream: 'https://local.marcosbrendon.com',
  // Port 47834 chosen from IANA unassigned range to avoid conflicts with
  // common dev services (Node 3000, Vite 5173, Tomcat 8080, etc).
  port: 47834,
  token: null as string | null,
}

// ─── Config loading ─────────────────────────────────────────────────────

interface Config {
  upstream: string
  port: number
  token: string | null
}

function loadConfig(): Config {
  const base: Config = {
    upstream: process.env.DSTP_UPSTREAM || BAKED_DEFAULTS.upstream,
    port: Number(process.env.DSTP_PORT) || BAKED_DEFAULTS.port,
    token: process.env.DSTP_TOKEN || BAKED_DEFAULTS.token,
  }

  // Look next to the executable first (when run as compiled binary),
  // then CWD as fallback (dev mode).
  const candidates = [
    process.execPath ? join(dirname(process.execPath), 'dstp-relay.config.json') : null,
    join(process.cwd(), 'dstp-relay.config.json'),
  ].filter(Boolean) as string[]

  for (const cfgPath of candidates) {
    if (existsSync(cfgPath)) {
      try {
        const raw = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>
        const merged: Config = { ...base }
        if (typeof raw.upstream === 'string' && raw.upstream.length > 0) merged.upstream = raw.upstream
        if (typeof raw.port === 'number' && raw.port > 0 && raw.port < 65536) merged.port = raw.port
        if (typeof raw.token === 'string' && raw.token.length > 0) merged.token = raw.token
        console.log(`[relay] Using config: ${cfgPath}`)
        return merged
      } catch (err) {
        console.error(`[relay] Failed to read ${cfgPath}:`, err)
      }
    }
  }
  return base
}

// ─── Runtime ────────────────────────────────────────────────────────────

const cfg = loadConfig()
const upstreamUrl = new URL(cfg.upstream)

const VERBOSE = process.env.DSTP_VERBOSE === '1'
// Tunnel mode: use a persistent WebSocket to the backend instead of opening
// a fresh HTTPS request per DST sync. Falls back to HTTP if the WS disconnects.
const USE_WS = process.env.DSTP_USE_WS !== '0'  // default on

let requestCount = 0
let errorCount = 0
let lastUpstreamOkAt = 0

// ─── WebSocket tunnel to backend ────────────────────────────────────────
// Each DST sync HTTP request from the mod is tunneled as one WS message
// (request/response correlated by `id`). One persistent TLS connection
// for everything.

interface PendingRequest {
  resolve: (data: any) => void
  reject: (err: Error) => void
  timeoutHandle: ReturnType<typeof setTimeout>
}

const wsPending = new Map<number, PendingRequest>()
let wsMsgSeq = 1
let wsClient: WebSocket | null = null
let wsReconnectDelay = 1000
let wsConnectedAt = 0

// Local command buffer — backend pushes commands via WS as soon as they are
// enqueued, so the next poll from the mod can be answered in <5ms without any
// round-trip. Keyed by shard_id.
const pushedCommands = new Map<string, any[]>()

function bufferCommand(shard_id: string, command: any) {
  if (!pushedCommands.has(shard_id)) pushedCommands.set(shard_id, [])
  pushedCommands.get(shard_id)!.push(command)
}

function drainCommands(shard_id: string): any[] {
  const q = pushedCommands.get(shard_id) || []
  if (q.length > 0) pushedCommands.set(shard_id, [])
  return q
}

function wsUrl(): string {
  const u = new URL(cfg.upstream)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/api/dst/relay'
  u.search = ''
  return u.toString()
}

function connectWs() {
  if (!USE_WS) return
  const url = wsUrl()
  if (VERBOSE) console.log(`[relay-ws] connecting to ${url}`)
  const ws = new WebSocket(url)
  wsClient = ws

  ws.addEventListener('open', () => {
    wsConnectedAt = Date.now()
    wsReconnectDelay = 1000
    console.log(`[relay-ws] ✓ connected to ${url}`)
  })

  ws.addEventListener('message', (evt) => {
    try {
      const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer))
      if (!msg) return

      // Server push: a command was enqueued for this shard. Buffer it locally
      // so the mod's next poll gets it instantly without a round-trip.
      if (msg.type === 'command' && msg.shard_id && msg.command) {
        bufferCommand(msg.shard_id, msg.command)
        if (VERBOSE) console.log(`[relay-ws] push received: ${msg.command.type} → ${msg.shard_id}`)
        return
      }

      // Response to a sync request we sent
      if (msg.id) {
        const pending = wsPending.get(msg.id)
        if (!pending) return
        wsPending.delete(msg.id)
        clearTimeout(pending.timeoutHandle)
        pending.resolve(msg.data)
      }
    } catch (err) {
      if (VERBOSE) console.error('[relay-ws] bad message:', err)
    }
  })

  ws.addEventListener('close', () => {
    wsClient = null
    for (const [id, p] of wsPending) {
      clearTimeout(p.timeoutHandle)
      p.reject(new Error('websocket_closed'))
    }
    wsPending.clear()
    console.log(`[relay-ws] disconnected, reconnecting in ${wsReconnectDelay}ms`)
    setTimeout(connectWs, wsReconnectDelay)
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30_000)
  })

  ws.addEventListener('error', (err) => {
    if (VERBOSE) console.error('[relay-ws] error:', err)
  })
}

function isWsReady() {
  return wsClient !== null && wsClient.readyState === WebSocket.OPEN
}

function sendSyncViaWs(syncData: any, timeoutMs = 10_000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!isWsReady()) return reject(new Error('ws_not_ready'))
    const id = wsMsgSeq++
    const timeoutHandle = setTimeout(() => {
      wsPending.delete(id)
      reject(new Error('ws_timeout'))
    }, timeoutMs)
    wsPending.set(id, { resolve, reject, timeoutHandle })
    wsClient!.send(JSON.stringify({ id, type: 'sync', data: syncData }))
  })
}

// Start the tunnel
connectWs()

function banner() {
  const pad = (s: string, w: number) => s.padEnd(w).slice(0, w)
  console.log('')
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║                    DSTP Relay (running)                       ║')
  console.log('╠═══════════════════════════════════════════════════════════════╣')
  console.log(`║  Listening:  http://127.0.0.1:${pad(String(cfg.port), 31)}║`)
  console.log(`║  Upstream:   ${pad(cfg.upstream, 49)}║`)
  console.log('║                                                               ║')
  console.log('║  In the DST mod config, set BACKEND_URL to:                   ║')
  console.log(`║    http://127.0.0.1:${pad(String(cfg.port), 41)}║`)
  console.log('║                                                               ║')
  console.log('║  Keep this window open. Close it to stop the relay.           ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log('')
}

banner()

// Heartbeat status line every 30s so user can see it's alive.
setInterval(() => {
  const ago = lastUpstreamOkAt ? Math.round((Date.now() - lastUpstreamOkAt) / 1000) : -1
  const status = ago < 0 ? 'never connected' : `last success ${ago}s ago`
  const wsStatus = isWsReady() ? 'WS up' : 'WS down'
  console.log(`[relay] ${requestCount} req, ${errorCount} err, ${wsStatus}, upstream: ${status}`)
}, 30_000)

Bun.serve({
  port: cfg.port,
  hostname: '127.0.0.1',

  async fetch(req) {
    requestCount++
    const reqUrl = new URL(req.url)

    // Status endpoints — handy for diagnostics without touching upstream.
    if (reqUrl.pathname === '/' || reqUrl.pathname === '/relay-status') {
      return new Response(
        JSON.stringify({
          relay: 'DSTP',
          listening: `http://127.0.0.1:${cfg.port}`,
          upstream: cfg.upstream,
          requests: requestCount,
          errors: errorCount,
          lastUpstreamOkAt,
        }, null, 2),
        { headers: { 'content-type': 'application/json' } },
      )
    }

    // Build upstream URL preserving path + query.
    const target = new URL(reqUrl.pathname + reqUrl.search, cfg.upstream)
    target.host = upstreamUrl.host
    target.protocol = upstreamUrl.protocol
    target.port = upstreamUrl.port

    // Clone request headers, strip hop-by-hop, fix Host.
    const headers = new Headers(req.headers)
    headers.delete('host')
    headers.delete('connection')
    headers.delete('content-length') // fetch will recompute
    headers.set('host', upstreamUrl.host)
    headers.set('x-forwarded-for', req.headers.get('x-forwarded-for') || '127.0.0.1')
    headers.set('x-dstp-relay', '1')
    if (cfg.token) headers.set('x-dstp-relay-token', cfg.token)

    const body = (req.method === 'GET' || req.method === 'HEAD')
      ? undefined
      : await req.arrayBuffer()

    if (VERBOSE) console.log(`[relay] → ${req.method} ${reqUrl.pathname}${reqUrl.search}`)

    // Fast path: tunnel DST sync through the persistent WebSocket if it's up.
    // This skips a full HTTPS round-trip and keeps one warm connection to the
    // backend instead of opening fresh TLS per poll.
    if (req.method === 'POST' && reqUrl.pathname === '/api/dst/sync' && isWsReady()) {
      try {
        // DST's json.encode emits \' for single quotes (invalid JSON).
        // The HTTP handler on the backend has the same fix.
        const raw = body ? new TextDecoder().decode(body) : ''
        const fixed = raw.replace(/\\'/g, "'")
        const syncPayload = fixed ? JSON.parse(fixed) : {}

        const shardId = syncPayload?.shard_id
        const localCommands = shardId ? drainCommands(shardId) : []

        const response = await sendSyncViaWs(syncPayload)

        // Merge + dedupe. Backend push (via onCommandQueued) and backend
        // drain (sync response) can produce the same command twice because
        // they run in parallel. We dedupe by (type + queued_at) which is
        // stable and unique per command.
        const byKey = new Map<string, any>()
        for (const c of localCommands) byKey.set(`${c.type}|${c.queued_at ?? ''}|${JSON.stringify(c.data ?? {})}`, c)
        for (const c of (response?.commands || [])) byKey.set(`${c.type}|${c.queued_at ?? ''}|${JSON.stringify(c.data ?? {})}`, c)
        const mergedCommands = [...byKey.values()]
        const mergedResponse = { ...response, commands: mergedCommands }

        const bodyStr = JSON.stringify(mergedResponse)
        if (VERBOSE) {
          const src = localCommands.length > 0 ? `${localCommands.length} pushed + ${response?.commands?.length || 0} drained` : 'backend'
          console.log(`[relay] ← WS 200 POST /api/dst/sync (${bodyStr.length}b, ${src})`)
        }
        lastUpstreamOkAt = Date.now()
        return new Response(bodyStr, {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-length': String(bodyStr.length) },
        })
      } catch (err: any) {
        if (VERBOSE) console.log(`[relay] WS sync failed (${err.message}), falling back to HTTP`)
        // fall through to HTTP path
      }
    }

    // Timeout: if upstream doesn't respond in 10s, abort so the mod gets
    // a quick 504 instead of hanging forever (DST has limited concurrent
    // QueryServer slots — a stuck request blocks new ones).
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(target.toString(), {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
        signal: ctrl.signal,
      })
      clearTimeout(timeoutId)
      lastUpstreamOkAt = Date.now()

      // Read the body fully. Bun's fetch auto-decompresses gzip/brotli, but
      // leaves Content-Encoding header — which would trick downstream (DST's
      // libcurl) into trying to decompress plain bytes again. We rebuild
      // headers cleanly with only what DST needs.
      const bodyBytes = await res.arrayBuffer()

      if (VERBOSE) console.log(`[relay] ← ${res.status} ${req.method} ${reqUrl.pathname} (${bodyBytes.byteLength}b)`)

      const outHeaders = new Headers()
      // Preserve content-type (important: application/json so DST parses OK)
      const ct = res.headers.get('content-type')
      if (ct) outHeaders.set('content-type', ct)
      // Explicit content-length from actual bytes
      outHeaders.set('content-length', String(bodyBytes.byteLength))

      return new Response(bodyBytes, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
      })
    } catch (err: any) {
      clearTimeout(timeoutId)
      errorCount++
      const isTimeout = err.name === 'AbortError'
      console.error(`[relay] ${req.method} ${reqUrl.pathname} → ${isTimeout ? 'TIMEOUT after 10s' : err.message}`)
      return new Response(
        JSON.stringify({ error: isTimeout ? 'relay_upstream_timeout' : 'relay_upstream_unreachable', message: err.message }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      )
    }
  },

  error(err) {
    errorCount++
    console.error('[relay] server error:', err.message)
    return new Response('Relay error', { status: 500 })
  },
})
