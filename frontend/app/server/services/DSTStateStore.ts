// DSTStateStore - Server-side cache for DST server state
// Each DST server has 1-2 shards: master (overworld) and caves
// State is keyed by shard_id (e.g. "server-1:master", "server-1:caves")
// Grouped by server_id for the frontend

import type { KeyCombo } from '../live/FlowEngine'

const MAX_EVENTS_PER_SHARD = 200

interface ShardEntry {
  shard_id: string
  server_id: string
  shard_type: string  // "master" | "caves"
  server: any
  players: any[]
  events: any[]
  last_seen: number
  online: boolean
  active_events: Record<string, boolean>
  requested_events: Record<string, boolean> | null
  debounce: Record<string, number>
  requested_debounce: Record<string, number> | null
  // Dynamic key-watch set (for the key_pressed trigger). Unlike enable_events
  // (a request-once delta), keys are a FULL SET: the backend always knows the
  // complete desired watch set from the enabled flows, so removing/disabling a
  // key flow can shrink it. requested_keys is the pending set to deliver;
  // last_keys is what was last delivered (we only re-send on change).
  requested_keys: string[] | null
  last_keys: string[]
  // key_combo watch set — same full-set + re-send-on-change model as keys.
  requested_combos: KeyCombo[] | null
  last_combos: KeyCombo[]
}

export interface ServerGroup {
  server_id: string
  name: string
  shards: ShardEntry[]
  all_players: any[]     // merged from all shards
  online: boolean
  last_seen: number
}

class DSTStateStore {
  private shards: Map<string, ShardEntry> = new Map()
  private commandQueues: Map<string, any[]> = new Map()
  version: number = 0

  // Called by REST route when a DST shard syncs
  handleSync(server_id: string, shard_id: string, shard_type: string, server: any, players: any[], events: any[], active_events?: Record<string, boolean>, debounce?: Record<string, number>): { commands: any[]; enable_events?: Record<string, boolean>; debounce?: Record<string, number>; watch_keys?: { keys: string[]; combos: KeyCombo[] } } {
    let entry = this.shards.get(shard_id)
    if (!entry) {
      entry = {
        shard_id, server_id, shard_type,
        server: null, players: [], events: [],
        last_seen: 0, online: true,
        active_events: {}, requested_events: null,
        debounce: {}, requested_debounce: null,
        requested_keys: null, last_keys: [],
        requested_combos: null, last_combos: [],
      }
      this.shards.set(shard_id, entry)
    }

    entry.server = server
    entry.players = players
    entry.last_seen = Date.now()
    entry.online = true

    if (Array.isArray(events) && events.length > 0) {
      for (const evt of events) {
        entry.events.push({ ...evt, shard_id, server_id, shard_type, received_at: Date.now() })
      }
      while (entry.events.length > MAX_EVENTS_PER_SHARD) {
        entry.events.shift()
      }
    }

    // Store active events and debounce from the game
    if (active_events) entry.active_events = active_events
    if (debounce) entry.debounce = debounce

    this.version++

    // Drain command queue
    const queue = this.commandQueues.get(shard_id) || []
    if (queue.length > 0) {
      console.log(`[DSTP] DRAIN shard="${shard_id}" — returning ${queue.length} commands: ${queue.map(c => c.type).join(',')}`)
    }
    this.commandQueues.set(shard_id, [])

    // Check for pending requests
    const result: { commands: any[]; enable_events?: Record<string, boolean>; debounce?: Record<string, number>; watch_keys?: { keys: string[]; combos: KeyCombo[] } } = { commands: queue }
    if (entry.requested_events) {
      result.enable_events = entry.requested_events
      entry.requested_events = null
    }
    if (entry.requested_debounce) {
      result.debounce = entry.requested_debounce
      entry.requested_debounce = null
    }
    // keys and combos travel together in one watch_keys envelope. If EITHER changed,
    // (re)send the full current set of both (the client replaces its whole watch set).
    if (entry.requested_keys || entry.requested_combos) {
      const keys = entry.requested_keys ?? entry.last_keys
      const combos = entry.requested_combos ?? entry.last_combos
      result.watch_keys = { keys, combos }
      entry.last_keys = keys
      entry.last_combos = combos
      entry.requested_keys = null
      entry.requested_combos = null
    }

    return result
  }

  // True if this shard is currently known and online. Used by the sync route to
  // detect a (re)connection BEFORE handleSync flips it online, so it can recompute
  // the watch-key set and have it delivered in the SAME response.
  isShardOnline(shard_id: string): boolean {
    const entry = this.shards.get(shard_id)
    return !!entry && entry.online
  }

  // Forget the last-delivered watch keys for a server's shards, so the next
  // collectWatchKeys re-sends the set even if it's unchanged. Used on reconnect:
  // the mod-side watch set is lost on restart, so "unchanged vs last_keys" would
  // wrongly skip the re-send.
  resetWatchKeysFor(server_id: string) {
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) { shard.last_keys = []; shard.last_combos = [] }
    }
  }

  // Get servers grouped by server_id
  getServerGroups(): ServerGroup[] {
    const groups = new Map<string, ServerGroup>()

    for (const shard of this.shards.values()) {
      let group = groups.get(shard.server_id)
      if (!group) {
        group = {
          server_id: shard.server_id,
          name: '',
          shards: [],
          all_players: [],
          online: false,
          last_seen: 0,
        }
        groups.set(shard.server_id, group)
      }

      group.shards.push(shard)

      // Use master shard name as server name
      if (shard.shard_type === 'master' && shard.server?.name) {
        group.name = shard.server.name
      }

      // Merge players from all shards, tag with shard info
      for (const p of shard.players) {
        group.all_players.push({ ...p, shard_id: shard.shard_id, shard_type: shard.shard_type })
      }

      if (shard.online) group.online = true
      if (shard.last_seen > group.last_seen) group.last_seen = shard.last_seen
    }

    return Array.from(groups.values())
  }

  getAllEvents(): any[] {
    const all: any[] = []
    for (const shard of this.shards.values()) {
      all.push(...shard.events)
    }
    return all.sort((a, b) => a.received_at - b.received_at).slice(-500)
  }

  // Events for ONE server only (its shards merged). Used by the per-server room so a
  // panel viewing server A never receives server B's events on the wire (vs the global
  // getAllEvents, which leaked everything through the shared singleton state).
  getEventsForServer(server_id: string): any[] {
    const all: any[] = []
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) all.push(...shard.events)
    }
    return all.sort((a, b) => a.received_at - b.received_at).slice(-500)
  }

  // Subscribers notified whenever a command is enqueued. Used by the relay
  // WS endpoint to push commands to the relay proactively (before the next
  // mod poll arrives), so the relay can answer the poll locally with <5ms
  // latency instead of round-tripping to the backend.
  private commandListeners: Array<(shard_id: string, command: any) => void> = []

  onCommandQueued(listener: (shard_id: string, command: any) => void): () => void {
    this.commandListeners.push(listener)
    return () => {
      const i = this.commandListeners.indexOf(listener)
      if (i >= 0) this.commandListeners.splice(i, 1)
    }
  }

  // Queue command for a specific shard
  pushCommand(shard_id: string, type: string, data: any = {}) {
    if (!this.commandQueues.has(shard_id)) {
      this.commandQueues.set(shard_id, [])
    }
    const cmd = { type, data, queued_at: Date.now() }
    this.commandQueues.get(shard_id)!.push(cmd)
    for (const listener of this.commandListeners) {
      try { listener(shard_id, cmd) } catch (e) { console.error('[DSTStateStore] listener error:', e) }
    }
  }

  // Send command to all shards of a server
  pushCommandToServer(server_id: string, type: string, data: any = {}) {
    let sent = 0
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) {
        this.pushCommand(shard.shard_id, type, data)
        sent++
      }
    }
    if (sent === 0) {
      console.warn(`[DSTP] pushCommandToServer: NO shards found for server "${server_id}" — command "${type}" LOST. Active shards:`, [...this.shards.keys()])
    } else {
      console.log(`[DSTP] pushCommandToServer: "${type}" queued to ${sent} shard(s) of "${server_id}"`)
    }
  }

  // Find which shard a player is on
  findPlayerShard(server_id: string, userid: string): string | null {
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) {
        if (shard.players.find(p => p.userid === userid)) {
          return shard.shard_id
        }
      }
    }
    return null
  }

  // Broadcast to all shards globally
  broadcastCommand(type: string, data: any = {}) {
    for (const shard_id of this.shards.keys()) {
      this.pushCommand(shard_id, type, data)
    }
  }

  // Request event category toggle for a shard (delivered on next sync)
  requestEventToggle(shard_id: string, category: string, enabled: boolean) {
    const entry = this.shards.get(shard_id)
    if (!entry) return
    if (!entry.requested_events) {
      entry.requested_events = { ...entry.active_events }
    }
    entry.requested_events[category] = enabled
  }

  // Request event toggle for all shards of a server
  requestEventToggleForServer(server_id: string, category: string, enabled: boolean) {
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) {
        this.requestEventToggle(shard.shard_id, category, enabled)
      }
    }
  }

  // Set the FULL key-watch set for all shards of a server (the key_pressed
  // trigger). Reconciled by full set: a key dropped from `keys` (because its flow
  // was deleted/disabled) shrinks the watch set. Only flags a re-send when the
  // sorted/deduped set actually differs from what was last delivered, so a steady
  // state produces no traffic.
  requestWatchKeysForServer(server_id: string, keys: string[], combos: KeyCombo[] = []) {
    const next = [...new Set(keys.map(k => String(k).toUpperCase()))].sort()
    // Combos are compared by a stable JSON signature (order-independent on id).
    const sig = (cs: KeyCombo[]) => JSON.stringify([...cs].sort((a, b) => a.id.localeCompare(b.id)))
    const nextComboSig = sig(combos)
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) {
        const current = [...shard.last_keys].sort()
        const keysChanged = next.length !== current.length || next.some((k, i) => k !== current[i])
        const combosChanged = nextComboSig !== sig(shard.last_combos)
        if (keysChanged) shard.requested_keys = next
        if (combosChanged) shard.requested_combos = combos
      }
    }
  }

  // Get the current key-watch set for a server (last delivered).
  getWatchKeys(server_id: string): string[] {
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) {
        return [...(shard.requested_keys || shard.last_keys)]
      }
    }
    return []
  }

  // Set debounce for a specific event type on all shards of a server
  requestDebounceUpdate(server_id: string, event_type: string, seconds: number) {
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) {
        if (!shard.requested_debounce) {
          shard.requested_debounce = { ...shard.debounce }
        }
        shard.requested_debounce[event_type] = seconds
      }
    }
  }

  // Get current debounce for a server
  getDebounce(server_id: string): Record<string, number> {
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id && shard.debounce) {
        return { ...shard.debounce }
      }
    }
    return {}
  }

  // Get active events for a server (merged from all shards)
  getActiveEvents(server_id: string): Record<string, boolean> {
    const merged: Record<string, boolean> = {}
    for (const shard of this.shards.values()) {
      if (shard.server_id === server_id) {
        for (const [k, v] of Object.entries(shard.active_events)) {
          if (v) merged[k] = true
        }
      }
    }
    return merged
  }

  checkHealth() {
    const now = Date.now()
    const STALE_THRESHOLD = 60 * 60 * 1000 // 1 hour
    let changed = false

    for (const [shardId, entry] of this.shards) {
      const online = now - entry.last_seen < 30000
      if (entry.online !== online) {
        entry.online = online
        changed = true
      }

      // Remove shards that have been offline for over 1 hour
      if (!online && now - entry.last_seen > STALE_THRESHOLD) {
        this.shards.delete(shardId)
        this.commandQueues.delete(shardId)
        changed = true
      }
    }

    if (changed) this.version++
  }
}

const STORE_KEY = '__dstp_state_store__'
if (!(globalThis as any)[STORE_KEY]) {
  (globalThis as any)[STORE_KEY] = new DSTStateStore()
}

export const dstStateStore: DSTStateStore = (globalThis as any)[STORE_KEY]
