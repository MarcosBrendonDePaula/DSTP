// Tests for the recorder + replay pair. Recorder writes a real .jsonl session;
// replay reads it back and drives the real FlowEngine against a real saved flow,
// asserting the flows produce the expected commands on captured traffic.
//
// bun:test (uses bun:sqlite via FlowRepository); auto-discovered by the test
// runner (see scripts/bun-test-files.ts) — no config edits needed.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { syncRecorder } from './SyncRecorder'
import { parseRecording, replaySyncs, serversInRecording, type ReplayResult } from './replay'
import { FlowRepository, type FlowNode, type FlowEdge } from '../db'

const SERVER = `__test_replay_${Date.now()}`

// Builders (mirror the e2e suite).
const trigger = (id: string, eventType: string): FlowNode =>
  ({ id, type: 'trigger', data: { event_type: eventType }, position: { x: 0, y: 0 } } as any)
const action = (id: string, actionType: string, params: any = {}): FlowNode =>
  ({ id, type: 'action', data: { action_type: actionType, params }, position: { x: 0, y: 0 } } as any)
const edge = (source: string, target: string): FlowEdge =>
  ({ id: `${source}->${target}`, source, target } as any)

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
  try { rmSync(join(process.cwd(), 'data', 'replays', '__test_replay_session.jsonl')) } catch { /* ignore */ }
})

beforeEach(() => {
  const repo = new FlowRepository(SERVER)
  for (const f of repo.findAll()) repo.delete(f.id)
})

describe('SyncRecorder', () => {
  it('records nothing while inactive', () => {
    syncRecorder.stop()
    expect(syncRecorder.isActive()).toBe(false)
    syncRecorder.record({ server_id: SERVER, shard_id: `${SERVER}:master`, events: [] })
    expect(syncRecorder.recorded).toBe(0)
  })

  it('captures full sync payloads to a session file with relative timestamps', () => {
    syncRecorder.start('__test_replay_session', 1000)
    syncRecorder.record({
      server_id: SERVER, shard_id: `${SERVER}:master`, shard_type: 'master',
      server: { day: 3, phase: 'day' },
      players: [{ userid: 'KU_1', name: 'Wilson' }],
      events: [{ type: 'player_death', data: { userid: 'KU_1' } }],
      active_events: { players: true },
    }, 1500)
    const { file, count } = syncRecorder.stop()
    expect(count).toBe(1)

    const entries = parseRecording(readFileSync(file, 'utf8'))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      t: 500, // 1500 - 1000 start
      server_id: SERVER,
      server: { day: 3, phase: 'day' },
      players: [{ userid: 'KU_1', name: 'Wilson' }],
      events: [{ type: 'player_death', data: { userid: 'KU_1' } }],
    })
  })
})

describe('replaySyncs', () => {
  function recordingWith(events: any[], players: any[] = []) {
    return [{
      t: 0, server_id: SERVER, shard_id: `${SERVER}:master`, shard_type: 'master',
      server: {}, players, events,
    }]
  }

  it('replays a captured event through a saved flow and produces its command', async () => {
    new FlowRepository(SERVER).save({
      id: 'f1', name: 'f1', enabled: true,
      nodes: [trigger('t', 'player_death'), action('a', 'announce', { message: 'RIP {{trigger.userid}}' })],
      edges: [edge('t', 'a')],
    })
    const rec = recordingWith([{ type: 'player_death', data: { userid: 'KU_9' } }])
    const r: ReplayResult = await replaySyncs(SERVER, rec)

    expect(r.events).toBe(1)
    expect(r.commands).toHaveLength(1)
    expect(r.commands[0]).toMatchObject({ type: 'announce', data: { message: 'RIP KU_9' } })
    expect(r.byEventType['player_death']).toHaveLength(1)
  })

  it('feeds the recorded player snapshot to get_player during replay', async () => {
    new FlowRepository(SERVER).save({
      id: 'f2', name: 'f2', enabled: true,
      nodes: [
        { id: 't', type: 'trigger', data: { event_type: 'chat_message' }, position: { x: 0, y: 0 } } as any,
        { id: 'g', type: 'get_player', data: { params: { userid: 'KU_1' } }, position: { x: 0, y: 0 } } as any,
        action('a', 'announce', { message: 'hp={{g.health}}' }),
      ],
      edges: [edge('t', 'g'), edge('g', 'a')],
    })
    const rec = recordingWith(
      [{ type: 'chat_message', data: {} }],
      [{ userid: 'KU_1', name: 'Wilson', health: 73 }],
    )
    const r = await replaySyncs(SERVER, rec)
    expect(r.commands[0]).toMatchObject({ type: 'announce', data: { message: 'hp=73' } })
  })

  it('captures commands from nodes AFTER an async (script) node', async () => {
    // Regression: replaySyncs used to read commands synchronously right after
    // evaluateEvent, so a flow that awaits (script node) lost every node past the
    // await. Here the announce runs only after the script's await resolves.
    new FlowRepository(SERVER).save({
      id: 'f_async', name: 'f_async', enabled: true,
      nodes: [
        { id: 't', type: 'trigger', data: { event_type: 'player_death' }, position: { x: 0, y: 0 } } as any,
        { id: 's', type: 'script', data: { action_type: 'script', params: { code: 'function run(c){ return { ok: 1 }; }' } }, position: { x: 0, y: 0 } } as any,
        action('a', 'announce', { message: 'after-script' }),
      ],
      edges: [edge('t', 's'), edge('s', 'a')],
    })
    const rec = recordingWith([{ type: 'player_death', data: { userid: 'KU_1' } }])
    const r = await replaySyncs(SERVER, rec)
    expect(r.commands.map(c => c.type)).toContain('announce')
  })

  it('ignores syncs for other servers', async () => {
    const rec = [
      { t: 0, server_id: 'other', shard_id: 'other:master', shard_type: 'master', server: {}, players: [], events: [{ type: 'player_death', data: {} }] },
    ] as any
    const r = await replaySyncs(SERVER, rec)
    expect(r.syncs).toBe(0)
    expect(r.events).toBe(0)
  })

  it('serversInRecording lists distinct server ids', () => {
    const rec = [
      { server_id: 'a' }, { server_id: 'b' }, { server_id: 'a' },
    ] as any
    expect(serversInRecording(rec).sort()).toEqual(['a', 'b'])
  })
})
