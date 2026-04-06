// DSTStateStore - Server-side cache for DST server state
// Each DST server has 1-2 shards: master (overworld) and caves
// State is keyed by shard_id (e.g. "server-1:master", "server-1:caves")
// Grouped by server_id for the frontend

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
  handleSync(server_id: string, shard_id: string, shard_type: string, server: any, players: any[], events: any[], active_events?: Record<string, boolean>, debounce?: Record<string, number>): { commands: any[]; enable_events?: Record<string, boolean>; debounce?: Record<string, number> } {
    let entry = this.shards.get(shard_id)
    if (!entry) {
      entry = {
        shard_id, server_id, shard_type,
        server: null, players: [], events: [],
        last_seen: 0, online: true,
        active_events: {}, requested_events: null,
        debounce: {}, requested_debounce: null,
      }
      this.shards.set(shard_id, entry)
    }

    entry.server = server
    entry.players = players
    entry.last_seen = Date.now()
    entry.online = true

    if (events && events.length > 0) {
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
    this.commandQueues.set(shard_id, [])

    // Check for pending requests
    const result: { commands: any[]; enable_events?: Record<string, boolean>; debounce?: Record<string, number> } = { commands: queue }
    if (entry.requested_events) {
      result.enable_events = entry.requested_events
      entry.requested_events = null
    }
    if (entry.requested_debounce) {
      result.debounce = entry.requested_debounce
      entry.requested_debounce = null
    }

    return result
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

  // Queue command for a specific shard
  pushCommand(shard_id: string, type: string, data: any = {}) {
    if (!this.commandQueues.has(shard_id)) {
      this.commandQueues.set(shard_id, [])
    }
    this.commandQueues.get(shard_id)!.push({ type, data, queued_at: Date.now() })
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
