// End-to-end tests for the flow execution motor, driven through the REAL public
// entrypoint (`evaluateEvent`) with a real FlowRepository persisting to a temp
// sqlite db. This exercises the same path production runs: find enabled flow →
// match trigger → executeFlow → processNode → host.pushCommand.
//
// What this guards (the "is the car actually driving?" tests, vs the unit tests
// that check individual parts):
//   - fan-out: a node with N out-edges runs all N targets
//   - condition: only the matching true/false branch is followed
//   - action chaining + {{...}} context resolution between nodes
//   - alias resolution, set_variable feeding downstream, numeric coercion
//
// Run under `bun test` (bun:sqlite + bun:test).
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository, type FlowNode, type FlowEdge } from '../db'

// ── Fake host: capture every command/state the engine emits ──
type Cmd = { serverId: string; type: string; data: any }
function makeHost() {
  const commands: Cmd[] = []
  const states: Record<string, any>[] = []
  const toggles: Array<{ serverId: string; category: string; enabled: boolean }> = []
  const host: EngineHost = {
    pushCommand: (serverId, type, data) => { commands.push({ serverId, type, data }) },
    getServerGroups: () => [],
    emitState: (delta) => { states.push(delta) },
    requestEventToggle: (serverId, category, enabled) => { toggles.push({ serverId, category, enabled }) },
  }
  return { host, commands, states, toggles }
}

// ── Node/edge builders ──
const trigger = (id: string, eventType: string, data: any = {}): FlowNode =>
  ({ id, type: 'trigger', data: { event_type: eventType, ...data }, position: { x: 0, y: 0 } } as any)
const action = (id: string, actionType: string, params: any = {}, data: any = {}): FlowNode =>
  ({ id, type: 'action', data: { action_type: actionType, params, ...data }, position: { x: 0, y: 0 } } as any)
const condition = (id: string, params: any): FlowNode =>
  ({ id, type: 'condition', data: { ...params }, position: { x: 0, y: 0 } } as any)
const setVar = (id: string, params: any, data: any = {}): FlowNode =>
  ({ id, type: 'set_variable', data: { params, ...data }, position: { x: 0, y: 0 } } as any)
const edge = (source: string, target: string, sourceHandle?: string): FlowEdge =>
  ({ id: `${source}->${target}${sourceHandle ? ':' + sourceHandle : ''}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) } as any)

// ── Temp db per test file; unique flow ids per test avoid the getAnalysis cache ──
const SERVER = `__test_flowengine_${Date.now()}`
let seq = 0
const uid = () => `f_${Date.now()}_${seq++}`

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

let engine: FlowEngine
let commands: Cmd[]

beforeEach(() => {
  // Wipe any flows left by prior tests — evaluateEvent runs ALL enabled flows
  // matching the event, so leftover flows in the shared db would fire too.
  const repo = new FlowRepository(SERVER)
  for (const f of repo.findAll()) repo.delete(f.id)

  const h = makeHost()
  engine = new FlowEngine(h.host)
  commands = h.commands
})

// Save a flow (enabled) and fire one event; evaluateEvent is fire-and-forget, so
// drain the microtask/timer queue so the async executeFlow finishes before asserts.
async function run(nodes: FlowNode[], edges: FlowEdge[], event: any, flowId = uid()) {
  new FlowRepository(SERVER).save({ id: flowId, name: flowId, enabled: true, nodes, edges })
  engine.evaluateEvent(SERVER, event)
  // Let the un-awaited executeFlow chain settle.
  await new Promise(r => setTimeout(r, 20))
  return flowId
}

describe('FlowEngine e2e — trigger → action', () => {
  it('fires the action when the trigger event matches', async () => {
    const nodes = [trigger('t', 'player_death'), action('a', 'announce', { message: 'RIP' })]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: {} })

    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ type: 'announce', data: { message: 'RIP' } })
  })

  it('does NOT fire when the event type does not match the trigger', async () => {
    const nodes = [trigger('t', 'player_death'), action('a', 'announce', { message: 'RIP' })]
    await run(nodes, [edge('t', 'a')], { type: 'player_spawn', data: {} })
    expect(commands).toHaveLength(0)
  })

  it('does NOT fire a disabled flow', async () => {
    const id = uid()
    const nodes = [trigger('t', 'player_death'), action('a', 'announce', { message: 'RIP' })]
    new FlowRepository(SERVER).save({ id, name: id, enabled: false, nodes, edges: [edge('t', 'a')] })
    engine.evaluateEvent(SERVER, { type: 'player_death', data: {} })
    await new Promise(r => setTimeout(r, 20))
    expect(commands).toHaveLength(0)
  })
})

describe('FlowEngine e2e — fan-out', () => {
  it('runs ALL targets of a node with multiple out-edges', async () => {
    const nodes = [
      trigger('t', 'player_death'),
      action('a', 'announce', { message: 'one' }),
      action('b', 'kick', { userid: 'u1' }),
    ]
    await run(nodes, [edge('t', 'a'), edge('t', 'b')], { type: 'player_death', data: {} })

    const types = commands.map(c => c.type).sort()
    expect(types).toEqual(['announce', 'kick'])
  })

  it('chains a linear A → B → C in order', async () => {
    const nodes = [
      trigger('t', 'player_death'),
      action('a', 'announce', { message: 'a' }),
      action('b', 'announce', { message: 'b' }),
      action('c', 'announce', { message: 'c' }),
    ]
    await run(nodes, [edge('t', 'a'), edge('a', 'b'), edge('b', 'c')], { type: 'player_death', data: {} })
    expect(commands.map(c => c.data.message)).toEqual(['a', 'b', 'c'])
  })
})

describe('FlowEngine e2e — condition branching', () => {
  const build = () => [
    trigger('t', 'health_delta'),
    condition('c', { field: '{{trigger.hp}}', operator: 'less_than', value: '50' }),
    action('lo', 'announce', { message: 'low' }),
    action('hi', 'announce', { message: 'high' }),
  ]
  const edges = [edge('t', 'c'), edge('c', 'lo', 'true'), edge('c', 'hi', 'false')]

  it('follows only the TRUE branch when the condition holds', async () => {
    await run(build(), edges, { type: 'health_delta', data: { hp: 20 } })
    expect(commands.map(c => c.data.message)).toEqual(['low'])
  })

  it('follows only the FALSE branch when the condition fails', async () => {
    await run(build(), edges, { type: 'health_delta', data: { hp: 90 } })
    expect(commands.map(c => c.data.message)).toEqual(['high'])
  })
})

describe('FlowEngine e2e — context resolution', () => {
  it('resolves {{trigger.field}} into an action param', async () => {
    const nodes = [
      trigger('t', 'player_death'),
      action('a', 'announce', { message: 'bye {{trigger.name}}' }),
    ]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: { name: 'Wilson' } })
    expect(commands[0].data.message).toBe('bye Wilson')
  })

  it('resolves a node alias downstream ({{alias.field}})', async () => {
    const nodes = [
      trigger('t', 'player_death', { alias: 'died' }),
      action('a', 'announce', { message: '{{died.name}} fell' }),
    ]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: { name: 'Maxwell' } })
    expect(commands[0].data.message).toBe('Maxwell fell')
  })

  it('feeds a set_variable output into a downstream action', async () => {
    // set_variable's output IS its resolved params bag: { greeting: 'hello' }.
    const nodes = [
      trigger('t', 'player_death'),
      setVar('v', { greeting: 'hello' }),
      action('a', 'announce', { message: '{{v.greeting}}' }),
    ]
    await run(nodes, [edge('t', 'v'), edge('v', 'a')], { type: 'player_death', data: {} })
    expect(commands[0].data.message).toBe('hello')
  })

  it('coerces known-numeric params to numbers (heal amount)', async () => {
    const nodes = [
      trigger('t', 'player_death'),
      action('a', 'heal', { userid: 'u1', amount: '100' }),
    ]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: {} })
    expect(commands[0].data.amount).toBe(100)
    expect(typeof commands[0].data.amount).toBe('number')
  })

  it('does NOT coerce a non-numeric param that happens to be digits (message)', async () => {
    const nodes = [
      trigger('t', 'player_death'),
      action('a', 'announce', { message: '100' }),
    ]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: {} })
    expect(commands[0].data.message).toBe('100')
    expect(typeof commands[0].data.message).toBe('string')
  })
})
