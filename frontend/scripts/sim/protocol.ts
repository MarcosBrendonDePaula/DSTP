// DSTP Game Simulator — protocol types and payload builders.
//
// Mirrors exactly what scripts/dstp/client.lua sends to POST /api/dst/sync
// and what the backend (handleDstSync) returns. The simulator is a synthetic
// DST host: it speaks the real HTTP protocol so we exercise the production
// path (route → processAutomationEvent → command queue → response) without a
// real game running.

// ─── What the mod sends ──────────────────────────────

export interface SimPlayer {
  userid: string
  name: string
  prefab: string
  admin: boolean
  age: number
  position: { x: number; y: number; z: number }
  health?: { current: number; max: number; invincible: boolean }
  hunger?: { current: number; max: number }
  sanity?: { current: number; max: number }
  inventory?: any[]
  buffs?: Record<string, boolean>
}

export interface SimEvent {
  type: string
  data?: Record<string, any>
  raw?: any
}

export interface SyncRequest {
  server_id: string
  shard_id: string
  shard_type: 'master' | 'caves'
  server: {
    name: string
    day?: number
    season?: string
    phase?: string
    time_scale?: number
    paused?: boolean
    max_players?: number
  }
  players: SimPlayer[]
  events: SimEvent[]
  active_events?: Record<string, boolean>
  debounce?: Record<string, number>
}

// ─── What the backend returns ────────────────────────

export interface SyncResponse {
  commands: Array<{ type: string; data?: any; [k: string]: any }>
  enable_events?: Record<string, boolean>
  debounce?: Record<string, number>
  error?: string
}

// ─── Builders ────────────────────────────────────────

export function makePlayer(partial: Partial<SimPlayer> & { userid: string; name: string }): SimPlayer {
  return {
    prefab: 'wilson',
    admin: false,
    age: 1,
    position: { x: 0, y: 0, z: 0 },
    health: { current: 150, max: 150, invincible: false },
    hunger: { current: 150, max: 150 },
    sanity: { current: 200, max: 200 },
    inventory: [],
    buffs: {},
    ...partial,
  }
}
