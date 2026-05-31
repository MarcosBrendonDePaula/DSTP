// SimHost — a synthetic DST shard that polls POST /api/dst/sync in a loop,
// exactly like scripts/dstp/client.lua does. Queue events with emit(); they
// ride along on the next poll. Commands returned by the backend are surfaced
// via the onCommands callback.

import type { SimEvent, SimPlayer, SyncRequest, SyncResponse } from './protocol'
import { makePlayer } from './protocol'

export interface SimHostOptions {
  baseUrl?: string            // default http://127.0.0.1:3000
  serverId: string
  shardId?: string            // default `${serverId}:master`
  shardType?: 'master' | 'caves'
  serverName?: string
  pollIntervalMs?: number     // default 1000 (mod uses 5s adaptive; faster for tests)
  onCommands?: (commands: SyncResponse['commands'], res: SyncResponse) => void
  onError?: (err: unknown) => void
  verbose?: boolean
}

export class SimHost {
  private baseUrl: string
  private serverId: string
  private shardId: string
  private shardType: 'master' | 'caves'
  private serverName: string
  private pollIntervalMs: number
  private onCommands?: SimHostOptions['onCommands']
  private onError?: SimHostOptions['onError']
  private verbose: boolean

  private players = new Map<string, SimPlayer>()
  private pendingEvents: SimEvent[] = []
  private activeEvents: Record<string, boolean> = {}
  private day = 1
  private season = 'autumn'
  private phase = 'day'

  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false

  // stats
  pollCount = 0
  commandCount = 0

  constructor(opts: SimHostOptions) {
    this.baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
    this.serverId = opts.serverId
    this.shardId = opts.shardId ?? `${opts.serverId}:master`
    this.shardType = opts.shardType ?? 'master'
    this.serverName = opts.serverName ?? `Sim ${opts.serverId}`
    this.pollIntervalMs = opts.pollIntervalMs ?? 1000
    this.onCommands = opts.onCommands
    this.onError = opts.onError
    this.verbose = opts.verbose ?? false
  }

  // ─── Player state ──────────────────────────────────

  addPlayer(p: Partial<SimPlayer> & { userid: string; name: string }): SimPlayer {
    const full = makePlayer(p)
    this.players.set(full.userid, full)
    return full
  }

  removePlayer(userid: string) {
    this.players.delete(userid)
  }

  getPlayer(userid: string): SimPlayer | undefined {
    return this.players.get(userid)
  }

  updatePlayer(userid: string, patch: Partial<SimPlayer>) {
    const p = this.players.get(userid)
    if (p) Object.assign(p, patch)
  }

  setWorld(patch: { day?: number; season?: string; phase?: string }) {
    if (patch.day !== undefined) this.day = patch.day
    if (patch.season !== undefined) this.season = patch.season
    if (patch.phase !== undefined) this.phase = patch.phase
  }

  // ─── Event injection ───────────────────────────────

  // Queue a fake game event. It is sent on the next poll, just like the mod's
  // debounced event queue.
  emit(type: string, data: Record<string, any> = {}) {
    this.pendingEvents.push({ type, data })
  }

  // ─── Polling loop ──────────────────────────────────

  start() {
    if (this.timer) return
    this.timer = setInterval(() => { void this.poll() }, this.pollIntervalMs)
    // fire one immediately
    void this.poll()
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // One sync cycle. Drains pending events into the request body, POSTs, and
  // hands any returned commands to onCommands.
  async poll(): Promise<SyncResponse | null> {
    if (this.polling) return null   // skip if a poll is still in flight
    this.polling = true

    const events = this.pendingEvents
    this.pendingEvents = []

    const body: SyncRequest = {
      server_id: this.serverId,
      shard_id: this.shardId,
      shard_type: this.shardType,
      server: {
        name: this.serverName,
        day: this.day,
        season: this.season,
        phase: this.phase,
        time_scale: 1,
        paused: false,
        max_players: 6,
      },
      players: [...this.players.values()],
      events,
      active_events: this.activeEvents,
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/dst/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as SyncResponse
      this.pollCount++

      // Honor backend's enable_events request (auto-activation), so subsequent
      // polls report the right active_events — mirrors the mod.
      if (json.enable_events) {
        this.activeEvents = { ...this.activeEvents, ...json.enable_events }
      }

      const commands = json.commands ?? []
      if (commands.length > 0) {
        this.commandCount += commands.length
        if (this.verbose) {
          console.log(`[sim ${this.shardId}] ← ${commands.length} cmd:`, commands.map(c => c.type).join(', '))
        }
        this.onCommands?.(commands, json)
      }
      return json
    } catch (err) {
      this.onError?.(err)
      if (this.verbose) console.error(`[sim ${this.shardId}] poll error:`, err)
      return null
    } finally {
      this.polling = false
    }
  }

  // Push events and force an immediate poll, returning the response. Handy for
  // tests/scenarios that want synchronous-ish "emit then see commands".
  async flush(): Promise<SyncResponse | null> {
    return this.poll()
  }
}
