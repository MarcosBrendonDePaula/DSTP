// ServerCoreManager — owns the per-server worker "cores" on the main thread.
//
// When a DST server first produces an event, we spawn a dedicated worker that
// runs that server's FlowEngine (DB, Wait/Merge, capture, store all local to the
// worker). Events are routed to the right worker; the side-effects the engine
// produces (queue a command, emit panel state, toggle event categories) come
// back as RPC messages and are applied here against the real main-thread
// services. Idle servers have their cores torn down to free memory.
//
// This is the seam that lets a runaway flow/script in one server's core affect
// only that server — not the API process or other servers.

import { dstStateStore } from '../services/DSTStateStore'
import { existsSync } from 'fs'
import { join, dirname } from 'path'

// Worker entry point. Bun's bundler doesn't follow new Worker(new URL(...)) with
// --target bun, so we ship the worker as a separate file and pick it per env:
//   - production: CI bundles it to dist/ServerCore.worker.js next to index.js
//   - dev:        the .ts source next to this module
// We probe the prod path first and fall back to the dev URL.
const WORKER_URL: string = (() => {
  const prod = join(dirname(Bun.main || process.cwd()), 'ServerCore.worker.js')
  if (existsSync(prod)) return prod
  return new URL('./ServerCore.worker.ts', import.meta.url).href
})()

const IDLE_TIMEOUT_MS = 10 * 60 * 1000   // tear down a core after 10min idle
const SWEEP_INTERVAL_MS = 60 * 1000

// Watchdog: ping each active core periodically; if it misses pongs for longer
// than HANG_TIMEOUT_MS it's considered hung (e.g. a script's while(true)) and is
// terminated + respawned so that server recovers instead of staying stuck.
const HEARTBEAT_INTERVAL_MS = 2000
const HANG_TIMEOUT_MS = 8000

interface Core {
  worker: Worker
  serverId: string
  lastUsed: number
  ready: boolean
  alive: boolean
  lastPong: number      // last time the core answered a ping
  pingSeq: number
}

// Extract world state (phase/day/season) from a server group's master shard.
// The mod sends these in `server.{phase,day,season}` on every sync.
function worldFrom(group: any): { phase: string; day: number; season: string } {
  const master = (group.shards || []).find((s: any) => s.shard_type === 'master') || (group.shards || [])[0]
  const srv = master?.server || {}
  return {
    phase: srv.phase ?? 'unknown',
    day: typeof srv.day === 'number' ? srv.day : 0,
    season: srv.season ?? 'unknown',
  }
}

// Forwarded to the connected Live panel (set by LiveAutomation on mount). Kept
// as a setter so we don't create an import cycle with LiveAutomation.
let panelEmit: ((delta: Record<string, any>) => void) | null = null
export function setPanelEmitter(fn: ((delta: Record<string, any>) => void) | null) {
  panelEmit = fn
}

class ServerCoreManager {
  private cores = new Map<string, Core>()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.sweepTimer = setInterval(() => this.sweepIdle(), SWEEP_INTERVAL_MS)
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS)
  }

  private handleRpc(serverId: string, method: string, args: any[]) {
    switch (method) {
      case 'pushCommand':
        dstStateStore.pushCommandToServer(args[0], args[1], args[2])
        break
      case 'emitState':
        panelEmit?.(args[0])
        break
      case 'requestEventToggle':
        dstStateStore.requestEventToggleForServer(args[0], args[1], args[2])
        break
      case 'requestWatchKeys':
        dstStateStore.requestWatchKeysForServer(args[0], args[1])
        break
      case 'logError':
        console.error(`[ServerCore ${serverId}]`, args[1])
        break
      default:
        console.warn(`[ServerCoreManager] unknown rpc from ${serverId}: ${method}`)
    }
  }

  private spawn(serverId: string): Core {
    const worker = new Worker(WORKER_URL)
    const core: Core = { worker, serverId, lastUsed: Date.now(), ready: false, alive: true, lastPong: Date.now(), pingSeq: 0 }

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'ready') {
        core.ready = true
      } else if (msg.type === 'pong') {
        core.lastPong = Date.now()
      } else if (msg.type === 'rpc') {
        this.handleRpc(serverId, msg.method, msg.args)
      }
    }
    worker.onerror = (err: any) => {
      // A worker error (uncaught throw, fatal message-handling failure) leaves
      // the core unusable. Mark it dead so the next route() respawns it instead
      // of posting into a corpse and silently losing events.
      console.error(`[ServerCore ${serverId}] worker error — marking dead for respawn:`, err?.message ?? err)
      core.alive = false
    }

    worker.postMessage({ type: 'init', serverId })
    this.cores.set(serverId, core)
    console.log(`[ServerCoreManager] spawned core for "${serverId}" (${this.cores.size} active)`)
    return core
  }

  private get(serverId: string): Core {
    let core = this.cores.get(serverId)
    if (!core || !core.alive) {
      if (core) {
        try { core.worker.terminate() } catch {}
        this.cores.delete(serverId)
        console.warn(`[ServerCoreManager] respawning dead core for "${serverId}"`)
      }
      core = this.spawn(serverId)
    }
    core.lastUsed = Date.now()
    return core
  }

  // Minimal, structured-clone-safe snapshot of this server's players, sent with
  // each event so the worker's mirror stays fresh for get_player / find_player /
  // script getPlayers(). The engine only reads { server_id, all_players }, so we
  // ship just that — NOT the full ServerGroup (which carries each shard's event
  // buffer and other refs that can break postMessage with "error: 72").
  // The JSON round-trip strips any non-cloneable values defensively.
  private groupsFor(serverId: string): any[] {
    const groups = dstStateStore.getServerGroups().filter((g: any) => g.server_id === serverId)
    try {
      return groups.map((g: any) => ({
        server_id: g.server_id,
        all_players: JSON.parse(JSON.stringify(g.all_players ?? [])),
        // World state (phase/day/season) taken from the master shard, so the
        // engine can expose {{trigger.phase}}/day/season on every event.
        world: worldFrom(g),
      }))
    } catch {
      // If even the players don't serialize, send an empty mirror rather than
      // crashing the worker — get_player just won't find anyone this tick.
      return groups.map((g: any) => ({ server_id: g.server_id, all_players: [], world: worldFrom(g) }))
    }
  }

  // Route a game event to the server's core. Spawns the core on demand. If the
  // postMessage itself throws (e.g. a non-cloneable payload slipped through),
  // mark the core dead, respawn, and retry once — never let it bubble up and
  // break handleDstSync (which would drop the rest of the sync's events).
  route(serverId: string, event: any) {
    const groups = this.groupsFor(serverId)
    const core = this.get(serverId)
    try {
      core.worker.postMessage({ type: 'event', event, groups })
    } catch (err: any) {
      console.error(`[ServerCore ${serverId}] postMessage failed, respawning + retrying:`, err?.message ?? err)
      core.alive = false
      const fresh = this.get(serverId)
      try {
        fresh.worker.postMessage({ type: 'event', event, groups })
      } catch (err2: any) {
        console.error(`[ServerCore ${serverId}] retry postMessage failed, dropping event:`, err2?.message ?? err2)
      }
    }
  }

  // Push a fresh player mirror to a server's core (called on /dst/sync) without
  // running an event — keeps the mirror warm even on event-less syncs.
  refreshMirror(serverId: string) {
    const core = this.cores.get(serverId)
    if (core) core.worker.postMessage({ type: 'mirror', groups: this.groupsFor(serverId) })
  }

  // A flow was deleted or disabled on the main thread — tell the worker (where the
  // engine actually runs) to abort any in-flight runs of it, so a long ai_agent loop
  // stops instead of finishing after the toggle. No-op if the core isn't spawned yet.
  unloadFlow(serverId: string, flowId: string) {
    const core = this.cores.get(serverId)
    if (core) core.worker.postMessage({ type: 'unloadFlow', flowId })
  }

  startCapture(serverId: string) {
    this.get(serverId).worker.postMessage({ type: 'startCapture' })
  }

  stopCapture(serverId: string) {
    const core = this.cores.get(serverId)
    if (core) core.worker.postMessage({ type: 'stopCapture' })
  }

  // Ping each ready core; if one hasn't ponged within HANG_TIMEOUT_MS it's stuck
  // in a synchronous loop (a runaway script). Terminate + respawn it so that
  // server recovers. Other servers' cores are unaffected — only the hung one is
  // killed. Any events that were queued behind the hang in that worker are lost,
  // but the alternative (a permanently dead server) is worse.
  private heartbeat() {
    const now = Date.now()
    for (const [serverId, core] of this.cores) {
      if (!core.ready || !core.alive) continue
      if (now - core.lastPong > HANG_TIMEOUT_MS) {
        console.warn(`[ServerCoreManager] core "${serverId}" hung (no pong for ${now - core.lastPong}ms) — killing + respawning`)
        try { core.worker.terminate() } catch {}
        this.cores.delete(serverId)
        // Respawn immediately so the server is ready for the next event.
        this.spawn(serverId)
        continue
      }
      core.pingSeq++
      try { core.worker.postMessage({ type: 'ping', id: core.pingSeq }) } catch {}
    }
  }

  private sweepIdle() {
    const now = Date.now()
    for (const [serverId, core] of this.cores) {
      if (now - core.lastUsed > IDLE_TIMEOUT_MS) {
        try { core.worker.terminate() } catch {}
        this.cores.delete(serverId)
        console.log(`[ServerCoreManager] tore down idle core "${serverId}" (${this.cores.size} active)`)
      }
    }
  }

  get activeCount(): number {
    return this.cores.size
  }

  destroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    for (const core of this.cores.values()) {
      try { core.worker.terminate() } catch {}
    }
    this.cores.clear()
  }
}

// Singleton on globalThis (survives HMR like the other stores).
const KEY = Symbol.for('dstp.serverCoreManager')
if (!(globalThis as any)[KEY]) {
  (globalThis as any)[KEY] = new ServerCoreManager()
}
export const serverCoreManager: ServerCoreManager = (globalThis as any)[KEY]
export { ServerCoreManager }
