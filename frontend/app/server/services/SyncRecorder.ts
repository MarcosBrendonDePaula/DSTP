// Sync recorder — a dev tool that captures every /dst/sync payload so a real
// game session can be replayed against the backend later (see scripts/replay.ts).
//
// WHY backend, not mod: every sync funnels through handleDstSync, so one hook here
// captures 100% of what the engine actually sees — players, world, events,
// active_events — without touching the Lua sandbox (no sockets/threads/FS there).
//
// OFF by default: recording only happens when DSTP_RECORD is set (or start() is
// called from a test/REPL), so production pays zero cost. Each session is one
// JSONL file under data/replays/, one line per sync, with a relative timestamp so
// replay can honor original pacing.
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type RecordedSync = {
  t: number          // ms since session start (for timed replay)
  server_id: string
  shard_id: string
  shard_type: string
  server: any        // world snapshot (day/phase/season/...)
  players: any[]
  events: any[]
  active_events?: Record<string, boolean>
}

const REPLAY_DIR = join(process.cwd(), 'data', 'replays')

class SyncRecorder {
  private active = false
  private startedAt = 0
  private file = ''
  private count = 0

  // Enabled via env at boot, or explicitly via start(). Frozen-ish: env is read
  // once so a session has a stable on/off state.
  constructor() {
    if (process.env.DSTP_RECORD) this.start(process.env.DSTP_RECORD)
  }

  isActive() { return this.active }
  get sessionFile() { return this.file }
  get recorded() { return this.count }

  // Begin a session. `label` names the file; pass a fixed clock for deterministic
  // tests (Date.now is banned in some contexts and breaks reproducibility).
  start(label = 'session', now: number = nowMs()) {
    if (!existsSync(REPLAY_DIR)) mkdirSync(REPLAY_DIR, { recursive: true })
    const safe = String(label).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'session'
    this.file = join(REPLAY_DIR, `${safe}.jsonl`)
    this.startedAt = now
    this.count = 0
    this.active = true
    return this.file
  }

  stop() {
    this.active = false
    return { file: this.file, count: this.count }
  }

  // Record one sync payload. No-op when inactive (the production fast path).
  record(payload: {
    server_id: string; shard_id: string; shard_type?: string
    server?: any; players?: any[]; events?: any[]
    active_events?: Record<string, boolean>
  }, now: number = nowMs()) {
    if (!this.active) return
    const entry: RecordedSync = {
      t: now - this.startedAt,
      server_id: payload.server_id,
      shard_id: payload.shard_id,
      shard_type: payload.shard_type || 'master',
      server: payload.server ?? null,
      players: payload.players ?? [],
      events: payload.events ?? [],
      active_events: payload.active_events,
    }
    try {
      appendFileSync(this.file, JSON.stringify(entry) + '\n')
      this.count++
    } catch (e) {
      console.error('[SyncRecorder] write failed:', e)
    }
  }
}

// Date.now() is banned in workflow/replay contexts but fine in the live server.
// Wrapped so a missing clock degrades gracefully rather than throwing.
function nowMs(): number {
  try { return Date.now() } catch { return 0 }
}

// One recorder per process (the sync route is process-wide).
export const syncRecorder: SyncRecorder =
  ((globalThis as any).__dstpSyncRecorder ??= new SyncRecorder())
