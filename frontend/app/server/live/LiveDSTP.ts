// LiveDSTP - DST Admin Panel Live Component
// Singleton: shared state for all admin panels
// Handles multi-shard servers (overworld + caves)

import { LiveComponent } from '@core/types/types'
import { dstStateStore } from '../services/DSTStateStore'
import { EventSchemaRepository } from '../db'
import { buildServerRoomState } from './serverRoomState'
import type { DSTPanel as _Client } from '@client/src/live/DSTPanel'

// Per-server subscriber instances. Since LiveDSTP is NOT a singleton, each connection
// has its own instance + its own reactive $state. A connection subscribes (joinServerRoom)
// to exactly ONE server, so mirroring that server's data into the instance's $state
// reaches ONLY that connection — reactive on the client AND isolated (no cross-server
// leak), without rooms or polling.
const _subscribers = new Map<string, Set<LiveDSTP>>()

// Push ONE server's current data to the instances subscribed to it (no-op if none).
export function pushServerData(serverId: string) {
  const subs = _subscribers.get(serverId)
  if (!subs || subs.size === 0) return
  const snap = buildServerRoomState(serverId)
  if (!snap) return
  for (const inst of subs) {
    try { (inst as any).setState(snap) } catch { /* ignore */ }
  }
}

export function pushAllServerData() {
  for (const serverId of _subscribers.keys()) pushServerData(serverId)
}

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

// Notify panels of a state change: push the changed server's data into its isolated
// room. The server-id list ($state) is refreshed by each instance's own 5s timer +
// mount. No singleton instance needed — rooms are addressed globally via the roomManager.
export function notifyLiveDSTP(serverId?: string) {
  if (serverId) pushServerData(serverId)
  else pushAllServerData()
}

// Global timer so per-server room state stays fresh even for servers no single panel
// is actively viewing-change (e.g. player moves). pushServerData is a no-op for rooms
// with no members, so this is cheap. Runs once for the process, not per connection.
let _roomTimer: NodeJS.Timeout | null = null
function ensureRoomTimer() {
  if (_roomTimer) return
  _roomTimer = setInterval(() => pushAllServerData(), 2000)
}

export class LiveDSTP extends LiveComponent<DSTPState> {
  static componentName = 'LiveDSTP'
  // NOT a singleton: one instance per panel connection, so each connection has its own
  // componentId and can join its server's room cleanly (a singleton shares one
  // componentId across connections, which breaks per-connection room membership).
  static publicActions = [
    'joinServerRoom',
    'leaveServerRoom',
    'sendCommand',
    'sendPlayerCommand',
    'broadcastCommand',
    'toggleEventCategory',
    'updateDebounce',
    'getEventSchemas',
    'saveEventSchema',
    'refresh',
  ] as const

  static defaultState: DSTPState = {
    serverIds: [],
    events: [],
  }

  private _refreshTimer?: NodeJS.Timeout
  private _lastIdsKey: string = ''
  private _subscribedServer: string | null = null

  protected onMount() {
    // NOT a singleton anymore: each panel connection gets its own instance. We only
    // keep the GLOBAL server-id list on the component $state (low-sensitivity); all
    // per-server DATA (players/events/...) goes through the isolated per-server rooms.
    ensureRoomTimer()
    this.pushStoreUpdate()
    this._refreshTimer = setInterval(() => this.pushStoreUpdate(), 5000)
  }

  protected onDestroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer)
    if (this._subscribedServer) _subscribers.get(this._subscribedServer)?.delete(this)
  }

  // Push ONLY the global server-id list to this connection. Per-server data is isolated
  // in rooms (pushServerData). This is the entire singleton-fan-out we used to leak,
  // reduced to a non-sensitive id array.
  pushStoreUpdate() {
    const newIds = dstStateStore.getServerGroups().map(g => g.server_id)
    const key = JSON.stringify(newIds)
    if (key === this._lastIdsKey) return
    this._lastIdsKey = key
    this.setState({ serverIds: newIds } as Partial<DSTPState>)
  }

  // ─── Public Actions ────────────────────────────────

  // The client can't join a room directly ("Room requires server-side join via
  // component action") — it calls this. We join THIS connection to the server's room
  // and seed it with the current state. From then on pushServerData() broadcasts only
  // to this room's members, so a panel viewing server A never receives B's data.
  // Subscribe THIS connection's instance to a server. Since LiveDSTP is no longer a
  // singleton, each connection has its own instance + its own $state, so mirroring a
  // server's data into this.setState reaches ONLY this connection — reactive on the
  // client (no polling) AND isolated (no cross-server leak). We register the instance
  // and push the current snapshot; pushServerData() fans live updates to subscribers.
  async joinServerRoom(payload: { server_id: string }) {
    const serverId = payload?.server_id
    if (!serverId) return { ok: false as const }
    this._subscribedServer = serverId
    if (!_subscribers.has(serverId)) _subscribers.set(serverId, new Set())
    _subscribers.get(serverId)!.add(this)
    const snap = buildServerRoomState(serverId)
    if (snap) this.setState(snap as Partial<DSTPState>)
    return { ok: true as const }
  }

  async leaveServerRoom(payload: { server_id: string }) {
    const serverId = payload?.server_id
    if (serverId) _subscribers.get(serverId)?.delete(this)
    if (this._subscribedServer === serverId) this._subscribedServer = null
    return { ok: true as const }
  }

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

  async updateDebounce(payload: { server_id: string; event_type: string; seconds: number }) {
    const { server_id, event_type, seconds } = payload
    if (!server_id || !event_type) throw new Error('server_id and event_type required')
    dstStateStore.requestDebounceUpdate(server_id, event_type, seconds)
    return { success: true }
  }

  async getEventSchemas(payload: { server_id: string }) {
    const repo = new EventSchemaRepository(payload.server_id)
    return { schemas: repo.findAll() }
  }

  async saveEventSchema(payload: { server_id: string; event_type: string; description: string; fields: any[] }) {
    const repo = new EventSchemaRepository(payload.server_id)
    repo.save(payload.event_type, payload.description, payload.fields)
    return { success: true }
  }

  async toggleEventCategory(payload: { server_id: string; category: string; enabled: boolean }) {
    const { server_id, category, enabled } = payload
    if (!server_id || !category) throw new Error('server_id and category required')
    dstStateStore.requestEventToggleForServer(server_id, category, enabled)
    return { success: true, category, enabled }
  }

  async refresh() {
    this._lastIdsKey = ''   // force a re-push of the server-id list
    this.pushStoreUpdate()
    pushAllServerData()
    return { success: true }
  }
}
