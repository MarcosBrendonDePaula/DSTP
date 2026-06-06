// Tests for the runaway-execution fix: a flow whose actions loop back into its own
// trigger (announce → chat_message) or that fires in a burst would stack unbounded
// concurrent runs ("4 IAs at once"). The engine now (1) caps concurrent runs of ONE
// flow (MAX_CONCURRENT_PER_FLOW) and drops excess triggers, and (2) abortFlow()
// cancels in-flight runs when a flow is deleted/disabled. A `delay` node keeps runs
// in flight long enough to observe both.
//
// Run under `bun test`.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository } from '../db'

const SERVER = `__test_concurrency_${Date.now()}`
const Repo = FlowRepository

function makeHost() {
  const commands: any[] = []
  const host: EngineHost = {
    pushCommand: (serverId, type, data) => { commands.push({ serverId, type, data }) },
    getServerGroups: () => [],
    emitState: () => {},
    requestEventToggle: () => {},
    requestWatchKeys: () => {},
  }
  return { host, commands }
}

const trigger = (id: string, eventType: string): any =>
  ({ id, type: 'trigger', data: { event_type: eventType }, position: { x: 0, y: 0 } })
const delayNode = (id: string, ms: number): any =>
  ({ id, type: 'delay', data: { params: { delay_ms: String(ms) } }, position: { x: 0, y: 0 } })
const action = (id: string, actionType: string, params: any = {}): any =>
  ({ id, type: 'action', data: { action_type: actionType, params }, position: { x: 0, y: 0 } })
const edge = (source: string, target: string): any => ({ id: `${source}->${target}`, source, target })

let engine: FlowEngine
let commands: any[]

beforeEach(() => {
  const repo = new Repo(SERVER)
  for (const f of repo.findAll()) repo.delete(f.id)
  const h = makeHost()
  engine = new FlowEngine(h.host)
  commands = h.commands
})

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

describe('FlowEngine — per-flow concurrency cap (the "4 IAs at once" fix)', () => {
  it('drops triggers once MAX_CONCURRENT_PER_FLOW runs of the same flow are in flight', async () => {
    // Flow: trigger → delay(100ms) → announce. Firing it 6 times in a burst means
    // 6 would-be overlapping runs, but the cap is 3 → only 3 announces eventually fire.
    const id = 'concflow'
    const nodes = [trigger('t', 'player_death'), delayNode('d', 100), action('a', 'announce', { message: 'x' })]
    new Repo(SERVER).save({ id, name: id, enabled: true, nodes, edges: [edge('t', 'd'), edge('d', 'a')] })

    for (let i = 0; i < 6; i++) engine.evaluateEvent(SERVER, { type: 'player_death', data: {} })
    // let the delays resolve
    await new Promise(r => setTimeout(r, 250))

    const announces = commands.filter(c => c.type === 'announce')
    expect(announces.length).toBe(3) // capped — the other 3 bursts were dropped
  })

  it('different flows do not share the cap (each flow has its own budget)', async () => {
    for (const id of ['fa', 'fb']) {
      const nodes = [trigger('t', 'player_death'), delayNode('d', 80), action('a', 'announce', { message: id })]
      new Repo(SERVER).save({ id, name: id, enabled: true, nodes, edges: [edge('t', 'd'), edge('d', 'a')] })
    }
    // one event fans to BOTH flows; each runs once, neither blocks the other
    engine.evaluateEvent(SERVER, { type: 'player_death', data: {} })
    await new Promise(r => setTimeout(r, 200))
    expect(commands.filter(c => c.type === 'announce').length).toBe(2)
  })
})

describe('FlowEngine — abortFlow cancels in-flight runs (delete/disable unload)', () => {
  it('a run aborted mid-delay does not fire its downstream action', async () => {
    const id = 'abortme'
    const nodes = [trigger('t', 'player_death'), delayNode('d', 150), action('a', 'announce', { message: 'should-not-fire' })]
    new Repo(SERVER).save({ id, name: id, enabled: true, nodes, edges: [edge('t', 'd'), edge('d', 'a')] })

    engine.evaluateEvent(SERVER, { type: 'player_death', data: {} })
    await new Promise(r => setTimeout(r, 30)) // run is now parked in the delay
    const n = engine.abortFlow(id)
    expect(n).toBe(1) // one in-flight run was signalled
    await new Promise(r => setTimeout(r, 250)) // wait past where the delay would have resolved

    // The downstream announce must NOT have fired (the flow was unloaded mid-run).
    expect(commands.filter(c => c.type === 'announce').length).toBe(0)
  })

  it('abortFlow on a flow with no in-flight runs is a no-op (returns 0)', () => {
    expect(engine.abortFlow('nope')).toBe(0)
  })
})
