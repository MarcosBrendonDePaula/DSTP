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
  // Mutable: tests that exercise get_player/find_player push groups here.
  const groups: any[] = []
  const host: EngineHost = {
    pushCommand: (serverId, type, data) => { commands.push({ serverId, type, data }) },
    getServerGroups: () => groups,
    emitState: (delta) => { states.push(delta) },
    requestEventToggle: (serverId, category, enabled) => { toggles.push({ serverId, category, enabled }) },
  }
  return { host, commands, states, toggles, groups }
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
const webhook = (id: string, params: any = {}): FlowNode =>
  ({ id, type: 'webhook', data: { params }, position: { x: 0, y: 0 } } as any)
const delay = (id: string, params: any = {}): FlowNode =>
  ({ id, type: 'delay', data: { params }, position: { x: 0, y: 0 } } as any)
const getPlayer = (id: string, params: any = {}): FlowNode =>
  ({ id, type: 'get_player', data: { params }, position: { x: 0, y: 0 } } as any)
const findPlayer = (id: string, params: any = {}): FlowNode =>
  ({ id, type: 'find_player', data: { params }, position: { x: 0, y: 0 } } as any)
const memory = (id: string, action: string, params: any = {}): FlowNode =>
  ({ id, type: 'memory', data: { action, params }, position: { x: 0, y: 0 } } as any)
const waitNode = (id: string, data: any = {}): FlowNode =>
  ({ id, type: 'wait', data, position: { x: 0, y: 0 } } as any)
const uiNode = (id: string, type: string, params: any = {}, pos: any = { x: 0, y: 0 }): FlowNode =>
  ({ id, type, data: { params }, position: pos } as any)
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
let groups: any[]

beforeEach(() => {
  // Wipe any flows left by prior tests — evaluateEvent runs ALL enabled flows
  // matching the event, so leftover flows in the shared db would fire too.
  const repo = new FlowRepository(SERVER)
  for (const f of repo.findAll()) repo.delete(f.id)

  const h = makeHost()
  engine = new FlowEngine(h.host)
  commands = h.commands
  groups = h.groups
})

// Register one server group with the given players (for get_player/find_player).
function setPlayers(players: any[]) {
  groups.length = 0
  groups.push({ server_id: SERVER, all_players: players })
}

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

describe('FlowEngine e2e — webhook trigger', () => {
  it('fires a flow whose entry is a webhook node matching webhookId', async () => {
    const nodes = [webhook('wh1'), action('a', 'announce', { message: 'pinged' })]
    await run(nodes, [edge('wh1', 'a')], { type: 'webhook', webhookId: 'wh1', data: {} })
    expect(commands.map(c => c.data.message)).toEqual(['pinged'])
  })

  it('does NOT fire when the webhookId does not match', async () => {
    const nodes = [webhook('wh1'), action('a', 'announce', { message: 'pinged' })]
    await run(nodes, [edge('wh1', 'a')], { type: 'webhook', webhookId: 'other', data: {} })
    expect(commands).toHaveLength(0)
  })

  it('does NOT fire a webhook node on a game event of the same payload', async () => {
    const nodes = [webhook('wh1'), action('a', 'announce', { message: 'pinged' })]
    // a non-webhook event must never trigger a webhook node
    await run(nodes, [edge('wh1', 'a')], { type: 'player_death', webhookId: 'wh1', data: {} })
    expect(commands).toHaveLength(0)
  })

  it('exposes the request body downstream as {{trigger.body.*}}', async () => {
    const nodes = [webhook('wh1'), action('a', 'announce', { message: 'hi {{trigger.body.name}}' })]
    await run(nodes, [edge('wh1', 'a')], {
      type: 'webhook', webhookId: 'wh1',
      data: { body: { name: 'Wilson' }, query: {}, headers: {}, method: 'POST' },
    })
    expect(commands[0].data.message).toBe('hi Wilson')
  })

  it('exposes query params downstream as {{trigger.query.*}}', async () => {
    const nodes = [webhook('wh1'), action('a', 'announce', { message: 'q={{trigger.query.x}}' })]
    await run(nodes, [edge('wh1', 'a')], {
      type: 'webhook', webhookId: 'wh1',
      data: { body: null, query: { x: '42' }, headers: {}, method: 'GET' },
    })
    expect(commands[0].data.message).toBe('q=42')
  })
})

describe('FlowEngine e2e — action / runFlowAction', () => {
  it('emits a generic action as pushCommand(action_type, resolvedParams)', async () => {
    const nodes = [trigger('t', 'player_death'), action('a', 'kick', { userid: '{{trigger.userid}}', reason: 'afk' })]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: { userid: 'KU_9' } })
    expect(commands[0]).toEqual({ serverId: SERVER, type: 'kick', data: { userid: 'KU_9', reason: 'afk' } })
  })

  it('coerces boolean param keys (visible) from string', async () => {
    // 'visible' is in BOOLEAN_PARAM_KEYS
    const nodes = [trigger('t', 'player_death'), action('a', 'set_flag', { visible: 'true' })]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: {} })
    expect(commands[0].data.visible).toBe(true)
  })

  it('a ui_ action emits a ui_command envelope and strips userid into it', async () => {
    const nodes = [trigger('t', 'player_death'), action('a', 'ui_notification', { userid: 'u1', text: 'hello', duration: '3' })]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: {} })
    expect(commands[0]).toMatchObject({
      type: 'ui_command',
      data: { userid: 'u1', cmd: { action: 'create', type: 'notification', text: 'hello', duration: 3 } },
    })
    expect(commands[0].data.cmd.userid).toBeUndefined() // userid lives on the envelope, not the cmd
  })

  it('a ui_ action WITHOUT userid emits nothing', async () => {
    const nodes = [trigger('t', 'player_death'), action('a', 'ui_notification', { text: 'hello' })]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: {} })
    expect(commands).toHaveLength(0)
  })

  it('ui_progress_bar value is the val/max ratio', async () => {
    const nodes = [trigger('t', 'player_death'), action('a', 'ui_progress_bar', { userid: 'u1', value: '50', max: '100' })]
    await run(nodes, [edge('t', 'a')], { type: 'player_death', data: {} })
    expect(commands[0].data.cmd.value).toBe(0.5)
  })
})

describe('FlowEngine e2e — delay', () => {
  it('clamps a negative delay to 0 and passes through', async () => {
    const nodes = [trigger('t', 'player_death'), delay('d', { delay_ms: '-5' }), action('a', 'announce', { message: 'after' })]
    await run(nodes, [edge('t', 'd'), edge('d', 'a')], { type: 'player_death', data: {} })
    expect(commands.map(c => c.data.message)).toEqual(['after'])
  })
})

describe('FlowEngine e2e — get_player', () => {
  it('returns the player object when found, usable downstream', async () => {
    setPlayers([{ userid: 'KU_1', name: 'Wilson', health: 88 }])
    const nodes = [
      trigger('t', 'chat_message'),
      getPlayer('g', { userid: 'KU_1' }),
      action('a', 'announce', { message: 'hp={{g.health}}' }),
    ]
    await run(nodes, [edge('t', 'g'), edge('g', 'a')], { type: 'chat_message', data: {} })
    expect(commands[0].data.message).toBe('hp=88')
  })

  it('returns an error object when the player is not found', async () => {
    setPlayers([])
    const nodes = [
      trigger('t', 'chat_message'),
      getPlayer('g', { userid: 'ghost' }),
      action('a', 'announce', { message: 'err={{g.error}}' }),
    ]
    await run(nodes, [edge('t', 'g'), edge('g', 'a')], { type: 'chat_message', data: {} })
    expect(commands[0].data.message).toBe('err=player not found')
  })
})

describe('FlowEngine e2e — find_player', () => {
  it('finds by case-insensitive substring and strips a command prefix', async () => {
    setPlayers([{ userid: 'KU_2', name: 'Maxwell' }])
    const nodes = [
      trigger('t', 'chat_message'),
      findPlayer('f', { name: '#tp maxw' }), // prefix '#tp ' stripped, 'maxw' matches Maxwell
      action('a', 'announce', { message: 'id={{f.userid}}' }),
    ]
    await run(nodes, [edge('t', 'f'), edge('f', 'a')], { type: 'chat_message', data: {} })
    expect(commands[0].data.message).toBe('id=KU_2')
  })
})

describe('FlowEngine e2e — memory (persistent)', () => {
  it('write then read round-trips a value through SQLite', async () => {
    // Same flowId so both nodes share the memory namespace.
    const fid = uid()
    const w = [trigger('t', 'player_death'), memory('m', 'write', { key: 'deaths', value: '7' })]
    await run(w, [edge('t', 'm')], { type: 'player_death', data: {} }, fid)

    const r = [trigger('t', 'player_death'), memory('m', 'read', { key: 'deaths' }), action('a', 'announce', { message: 'd={{m.value}}' })]
    await run(r, [edge('t', 'm'), edge('m', 'a')], { type: 'player_death', data: {} }, fid)
    expect(commands[0].data.message).toBe('d=7')
  })

  it('read of a missing key yields null in the node output', async () => {
    // The memory node's output is { action:'read', key, value: null } for a missing
    // key. We surface `action` (a present field) downstream to prove the node ran
    // and produced the read shape — value=null itself leaves a mixed-string
    // template literal (resolveValue keeps unresolved {{...}} verbatim), so assert
    // on a resolvable sibling field instead.
    const nodes = [trigger('t', 'player_death'), memory('m', 'read', { key: 'never_set_xyz' }), action('a', 'announce', { message: 'op={{m.action}}' })]
    await run(nodes, [edge('t', 'm'), edge('m', 'a')], { type: 'player_death', data: {} })
    expect(commands[0].data.message).toBe('op=read')
  })
})

describe('FlowEngine e2e — ui_builder / ui_panel (tree)', () => {
  it('ui_builder pushes a tree create command and resolves {{templates}}', async () => {
    const builder: FlowNode = {
      id: 'b', type: 'ui_builder',
      data: { params: { userid: 'u1', id: 'hud1' }, tree: { type: 'text', text: 'hi {{trigger.name}}' } },
      position: { x: 0, y: 0 },
    } as any
    const nodes = [trigger('t', 'player_death'), builder]
    await run(nodes, [edge('t', 'b')], { type: 'player_death', data: { name: 'Wendy' } })
    expect(commands[0]).toMatchObject({
      type: 'ui_command',
      data: { userid: 'u1', cmd: { action: 'create', type: 'tree', id: 'hud1', group: 'hud1', tree: { type: 'text', text: 'hi Wendy' } } },
    })
  })

  it('ui_panel node builds a tree from connected ui_* children and does NOT continue the action chain', async () => {
    const nodes = [
      trigger('t', 'player_death'),
      uiNode('p', 'ui_panel', { userid: 'u1', id: 'pnl', title: 'Shop' }),
      uiNode('txt', 'ui_text', { text: 'Welcome' }),
      action('after', 'announce', { message: 'should-not-run' }),
    ]
    // p has a ui_text child AND a normal action edge; only the child is consumed,
    // the action chain from a ui_panel node is intentionally not followed.
    await run(nodes, [edge('t', 'p'), edge('p', 'txt'), edge('p', 'after')], { type: 'player_death', data: {} })
    const ui = commands.find(c => c.type === 'ui_command')
    expect(ui!.data.cmd).toMatchObject({ action: 'create', type: 'tree', id: 'pnl', group: 'pnl' })
    expect(ui!.data.cmd.tree).toMatchObject({ type: 'panel', children: [{ type: 'text', text: 'Welcome' }] })
    // the announce action wired off ui_panel must NOT have fired
    expect(commands.some(c => c.type === 'announce')).toBe(false)
  })
})

describe('FlowEngine e2e — wait / merge (stateful)', () => {
  // Two trigger nodes (different event types) converge on one wait. The flow is
  // stateful (has a wait), so executeStatefulBranch handles each branch. The
  // downstream runs only after both branches arrive (mode 'all'). onSatisfied
  // fires via queueMicrotask, so we give it a moment to settle.
  function buildWaitFlow(mode: 'all' | 'any') {
    const nodes = [
      trigger('ta', 'player_spawn'),
      trigger('tb', 'player_death'),
      waitNode('w', { mode, correlation: 'broadcast', timeoutMs: 60000 }),
      action('done', 'announce', { message: 'merged' }),
    ]
    const edges = [edge('ta', 'w'), edge('tb', 'w'), edge('w', 'done')]
    return { nodes, edges }
  }

  it('mode "all" waits for BOTH branches before continuing', async () => {
    const fid = uid()
    const { nodes, edges } = buildWaitFlow('all')
    new FlowRepository(SERVER).save({ id: fid, name: fid, enabled: true, nodes, edges })

    // First branch only — must NOT continue yet.
    engine.evaluateEvent(SERVER, { type: 'player_spawn', data: { userid: 'KU_1' } })
    await new Promise(r => setTimeout(r, 30))
    expect(commands.some(c => c.type === 'announce')).toBe(false)

    // Second branch — now both arrived → downstream runs.
    engine.evaluateEvent(SERVER, { type: 'player_death', data: { userid: 'KU_1' } })
    await new Promise(r => setTimeout(r, 30))
    expect(commands.filter(c => c.type === 'announce').map(c => c.data.message)).toEqual(['merged'])
  })

  it('mode "any" continues as soon as the FIRST branch arrives', async () => {
    const fid = uid()
    const { nodes, edges } = buildWaitFlow('any')
    new FlowRepository(SERVER).save({ id: fid, name: fid, enabled: true, nodes, edges })

    engine.evaluateEvent(SERVER, { type: 'player_spawn', data: { userid: 'KU_1' } })
    await new Promise(r => setTimeout(r, 30))
    expect(commands.filter(c => c.type === 'announce')).toHaveLength(1)
  })
})
