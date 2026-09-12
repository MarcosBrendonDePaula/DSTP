// data_feed NODE: maps the flow params to the mod's feed_start / feed_stop commands
// (lists parsed, numbers coerced) and continues the chain.
//
// Run under `bun test`.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository, type FlowNode, type FlowEdge } from '../db'

type Cmd = { serverId: string; type: string; data: any }
const SERVER = `__test_datafeed_${Date.now()}`
let seq = 0
const uid = () => `f_${Date.now()}_${seq++}`
let engine: FlowEngine
let commands: Cmd[]

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

beforeEach(() => {
  const repo = new FlowRepository(SERVER)
  for (const f of repo.findAll()) repo.delete(f.id)
  commands = []
  const host: EngineHost = {
    pushCommand: (serverId, type, data) => { commands.push({ serverId, type, data }) },
    getServerGroups: () => [],
    emitState: () => {},
    requestEventToggle: () => {},
    requestWatchKeys: () => {},
  }
  engine = new FlowEngine(host)
})

const trigger = (id: string, eventType: string): FlowNode =>
  ({ id, type: 'trigger', data: { event_type: eventType }, position: { x: 0, y: 0 } } as any)
const action = (id: string, actionType: string, params: any = {}): FlowNode =>
  ({ id, type: 'action', data: { action_type: actionType, params }, position: { x: 0, y: 0 } } as any)
const feed = (id: string, params: any): FlowNode =>
  ({ id, type: 'data_feed', data: { params }, position: { x: 0, y: 0 } } as any)
const edge = (source: string, target: string): FlowEdge =>
  ({ id: `${source}->${target}`, source, target } as any)

async function run(nodes: FlowNode[], edges: FlowEdge[], event: any) {
  new FlowRepository(SERVER).save({ id: uid(), name: 'data-feed', enabled: true, nodes, edges })
  engine.evaluateEvent(SERVER, event)
  await new Promise(r => setTimeout(r, 20))
}

describe('data_feed node', () => {
  it('start → feed_start with parsed lists and numbers, then the chain continues', async () => {
    const nodes = [
      trigger('t', 'player_spawn'),
      feed('f', { operation: 'start', userid: '{{trigger.userid}}', id: 'mobs', prefabs: 'spider, hound', fields: 'hp, hp_max, burnable.burning', radius: '25', interval: '0.5', max: '20' }),
      action('after', 'announce', { message: 'next' }),
    ]
    await run(nodes, [edge('t', 'f'), edge('f', 'after')], { type: 'player_spawn', data: { userid: 'KU_1' } })
    const cmd = commands.find(c => c.type === 'feed_start')
    expect(cmd).toBeDefined()
    expect(cmd!.data).toMatchObject({
      userid: 'KU_1', id: 'mobs',
      prefabs: ['spider', 'hound'], fields: ['hp', 'hp_max', 'burnable.burning'],
      radius: 25, interval: 0.5, max: 20,
    })
    expect(commands.some(c => c.type === 'announce' && c.data.message === 'next')).toBe(true)
  })

  it('set → entity_set_data with guid/name/value (a flow-computed field the feed can ship as data.<name>)', async () => {
    const nodes = [trigger('t', 'player_kill'), feed('f', { operation: 'set', guid: '{{trigger.guid}}', name: 'bounty', value: '150' })]
    await run(nodes, [edge('t', 'f')], { type: 'player_kill', data: { guid: 777 } })
    expect(commands.find(c => c.type === 'entity_set_data')?.data).toMatchObject({ guid: 777, name: 'bounty', value: 150 })
  })

  it('stop → feed_stop with userid + id', async () => {
    const nodes = [trigger('t', 'player_left'), feed('f', { operation: 'stop', userid: 'u1', id: 'mobs' })]
    await run(nodes, [edge('t', 'f')], { type: 'player_left', data: {} })
    expect(commands.find(c => c.type === 'feed_stop')?.data).toMatchObject({ userid: 'u1', id: 'mobs' })
  })
})
