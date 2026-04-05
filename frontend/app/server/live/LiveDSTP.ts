// LiveDSTP - DST Admin Panel Live Component
// Singleton: shared state for all admin panels
// Handles multi-shard servers (overworld + caves)

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import type { DSTPanel as _Client } from '@client/src/live/DSTPanel'

// ─── State ───────────────────────────────────────────
// Flat keys for efficient STATE_DELTA:
//   serverIds: ["server-1"]
//   server:server-1: { name, online, shards: [{shard_id, shard_type, day, season, ...}] }
//   players:server-1: { "userid": { ...playerData, shard_type } }
//   events: [...]

interface DSTPState {
  serverIds: string[]
  events: any[]
  [key: string]: any
}

let _instance: LiveDSTP | null = null

export function notifyLiveDSTP() {
  _instance?.pushStoreUpdate()
}

export class LiveDSTP extends LiveComponent<DSTPState> {
  static componentName = 'LiveDSTP'
  static singleton = true
  static publicActions = [
    'sendCommand',
    'sendPlayerCommand',
    'broadcastCommand',
    'toggleEventCategory',
    'refresh',
  ] as const

  static defaultState: DSTPState = {
    serverIds: [],
    events: [],
  }

  private _refreshTimer?: NodeJS.Timeout
  private _lastVersion: number = -1

  protected onMount() {
    _instance = this
    this.pushStoreUpdate()
    this._refreshTimer = setInterval(() => this.pushStoreUpdate(), 5000)
  }

  protected onDestroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer)
    if (_instance === this) _instance = null
  }

  pushStoreUpdate() {
    if (dstStateStore.version === this._lastVersion) return
    this._lastVersion = dstStateStore.version

    const groups = dstStateStore.getServerGroups()
    const delta: Partial<DSTPState> = {}

    const newIds = groups.map(g => g.server_id)
    const oldIds: string[] = this.state.serverIds || []

    if (JSON.stringify(newIds) !== JSON.stringify(oldIds)) {
      delta.serverIds = newIds
    }

    for (const g of groups) {
      const serverKey = `server:${g.server_id}`
      const playersKey = `players:${g.server_id}`

      // Server info with shard details
      delta[serverKey] = {
        server_id: g.server_id,
        name: g.name || g.server_id,
        online: g.online,
        last_seen: g.last_seen,
        player_count: g.all_players.length,
        active_events: dstStateStore.getActiveEvents(g.server_id),
        shards: g.shards.map(s => ({
          shard_id: s.shard_id,
          shard_type: s.shard_type,
          online: s.online,
          day: s.server?.day,
          season: s.server?.season,
          phase: s.server?.phase,
          is_cave: s.server?.is_cave,
          max_players: s.server?.max_players,
          player_count: s.players.length,
        })),
      }

      // Players merged from all shards, keyed by userid
      const playersMap: Record<string, any> = {}
      for (const p of g.all_players) {
        playersMap[p.userid] = p
      }
      delta[playersKey] = playersMap
    }

    // Clean removed servers
    for (const oldId of oldIds) {
      if (!newIds.includes(oldId)) {
        delta[`server:${oldId}`] = null
        delta[`players:${oldId}`] = null
      }
    }

    // Events
    const newEvents = dstStateStore.getAllEvents()
    if (newEvents.length !== (this.state.events?.length || 0)) {
      delta.events = newEvents
    }

    if (Object.keys(delta).length > 0) {
      this.setState(delta)
    }
  }

  // ─── Public Actions ────────────────────────────────

  // Send command to a specific shard
  async sendCommand(payload: { shard_id: string; type: string; data?: Record<string, any> }) {
    if (!payload.shard_id || !payload.type) throw new Error('shard_id and type required')
    dstStateStore.pushCommand(payload.shard_id, payload.type, payload.data || {})
    return { success: true }
  }

  // Send command targeting a player — auto-finds the right shard
  async sendPlayerCommand(payload: { server_id: string; userid: string; type: string; data?: Record<string, any> }) {
    const { server_id, userid, type, data } = payload
    if (!server_id || !type) throw new Error('server_id and type required')

    // Find which shard the player is on
    const shard_id = dstStateStore.findPlayerShard(server_id, userid)
    if (shard_id) {
      dstStateStore.pushCommand(shard_id, type, { userid, ...data })
    } else {
      // Player not found — send to all shards of this server
      dstStateStore.pushCommandToServer(server_id, type, { userid, ...data })
    }
    return { success: true }
  }

  // Broadcast to all shards globally
  async broadcastCommand(payload: { type: string; data?: Record<string, any> }) {
    dstStateStore.broadcastCommand(payload.type, payload.data || {})
    return { success: true }
  }

  async toggleEventCategory(payload: { server_id: string; category: string; enabled: boolean }) {
    const { server_id, category, enabled } = payload
    if (!server_id || !category) throw new Error('server_id and category required')
    dstStateStore.requestEventToggleForServer(server_id, category, enabled)
    return { success: true, category, enabled }
  }

  async refresh() {
    this._lastVersion = -1
    this.pushStoreUpdate()
    return { success: true }
  }
}
