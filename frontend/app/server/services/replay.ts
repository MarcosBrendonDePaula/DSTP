// Replay engine — reproduces a recorded game session (see SyncRecorder) against
// the flow engine and captures what the flows produced. Used by scripts/replay.ts
// (CLI) and by tests to assert flow behavior on REAL captured traffic, with no
// running game.
//
// It drives the real FlowEngine through a fake EngineHost (the same approach as
// the e2e tests), so a replay exercises the production execution path: each
// recorded event → evaluateEvent → flow → host.pushCommand. The recorded player
// snapshot is fed to getServerGroups so get_player/find_player resolve as they
// did live.
import { readFileSync } from 'node:fs'
import { FlowEngine, type EngineHost } from '../live/FlowEngine'
import type { RecordedSync } from './SyncRecorder'

export type ReplayCommand = { server_id: string; type: string; data: any }

export type ReplayResult = {
  syncs: number
  events: number
  commands: ReplayCommand[]
  // commands grouped by the event type that (immediately) preceded them, useful
  // for "what did player_death trigger?" style assertions.
  byEventType: Record<string, ReplayCommand[]>
}

// Parse a .jsonl recording into entries (skips blank/comment lines).
export function parseRecording(text: string): RecordedSync[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => JSON.parse(l) as RecordedSync)
}

export function loadRecording(path: string): RecordedSync[] {
  return parseRecording(readFileSync(path, 'utf8'))
}

// Drain pending async flow work. evaluateEvent is fire-and-forget and a flow can
// await (script/http_request/delay nodes), so nodes AFTER an async one run on a
// later microtask/timer. Without this, replay captures only the commands emitted
// synchronously before the first await and silently drops the rest.
const settle = (ms = 10) => new Promise<void>(r => setTimeout(r, ms))

// Replay recorded syncs for ONE server against a fresh engine. The engine reads
// flows from that server's real db (FlowRepository), so the replay reflects the
// flows currently saved. Returns every command the flows emitted. Async because
// flows can await — we settle the event loop after each event so post-await nodes
// are captured.
export async function replaySyncs(serverId: string, recording: RecordedSync[]): Promise<ReplayResult> {
  const commands: ReplayCommand[] = []
  const byEventType: Record<string, ReplayCommand[]> = {}

  // Live player snapshot, updated per sync so get_player/find_player see what the
  // game saw at that moment. Keyed by shard so multi-shard sessions merge.
  const playersByShard = new Map<string, any[]>()

  const host: EngineHost = {
    pushCommand: (sid, type, data) => commands.push({ server_id: sid, type, data }),
    getServerGroups: () => {
      const all: any[] = []
      for (const [shard_id, players] of playersByShard) {
        for (const p of players) all.push({ ...p, shard_id })
      }
      return [{ server_id: serverId, all_players: all }]
    },
    emitState: () => {},
    requestEventToggle: () => {},
    requestWatchKeys: () => {},
  }

  const engine = new FlowEngine(host)
  let eventCount = 0

  for (const sync of recording) {
    if (sync.server_id !== serverId) continue
    playersByShard.set(sync.shard_id, sync.players || [])

    for (const evt of sync.events || []) {
      const before = commands.length
      engine.evaluateEvent(serverId, evt)
      eventCount++
      // Let the (possibly async) flow finish before attributing its commands.
      await settle()
      const produced = commands.slice(before)
      if (produced.length) {
        (byEventType[evt.type] ??= []).push(...produced)
      }
    }
  }

  return {
    syncs: recording.filter(s => s.server_id === serverId).length,
    events: eventCount,
    commands,
    byEventType,
  }
}

// Distinct server ids present in a recording (so the CLI can list/pick).
export function serversInRecording(recording: RecordedSync[]): string[] {
  return [...new Set(recording.map(s => s.server_id))]
}
