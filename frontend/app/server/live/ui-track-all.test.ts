// ui_track in flows: mode=all with a per-entity TEMPLATE drawn from the ui_* children
// wired under the node, `bind` props carried into the tree for the client to evaluate
// locally, and — unlike ui_panel — the action chain after ui_track still runs (the
// children are the template, the other out-edges are the next actions).
//
// Run under `bun test`.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository, type FlowNode, type FlowEdge } from '../db'

type Cmd = { serverId: string; type: string; data: any }
const SERVER = `__test_uitrack_${Date.now()}`
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
const uiNode = (id: string, type: string, params: any = {}, pos: any = { x: 0, y: 0 }): FlowNode =>
  ({ id, type, data: { params }, position: pos } as any)
const track = (id: string, params: any): FlowNode =>
  ({ id, type: 'ui_track', data: { action_type: 'ui_track', params }, position: { x: 0, y: 0 } } as any)
const edge = (source: string, target: string): FlowEdge =>
  ({ id: `${source}->${target}`, source, target } as any)

async function run(nodes: FlowNode[], edges: FlowEdge[], event: any) {
  new FlowRepository(SERVER).save({ id: uid(), name: 'ui-track', enabled: true, nodes, edges })
  engine.evaluateEvent(SERVER, event)
  await new Promise(r => setTimeout(r, 20))
}

describe('FlowEngine — ui_track mode=all with a template of ui_* children', () => {
  it('emits ONE follow command with the entity filter, the template tree and its bind props, then continues the chain', async () => {
    const nodes = [
      trigger('t', 'player_spawn'),
      track('tr', { userid: '{{trigger.userid}}', id: 'hpbars', mode: 'all', radius: '20', prefabs: 'spider, hound', require_hp: 'true', offset_y: '50' }),
      uiNode('col', 'ui_col', { gap: '2' }),
      uiNode('nm', 'ui_text', { text: '?', size: '14', bind: 'text=entity.name' }, { x: 0, y: 0 }),
      uiNode('hp', 'ui_bar', { value: '1', max: '1', width: '60', height: '8', bind: '{"value":"entity.hp","max":"entity.hp_max"}' }, { x: 0, y: 10 }),
      action('after', 'announce', { message: 'next' }),
    ]
    const edges = [edge('t', 'tr'), edge('tr', 'col'), edge('col', 'nm'), edge('col', 'hp'), edge('tr', 'after')]
    await run(nodes, edges, { type: 'player_spawn', data: { userid: 'KU_1' } })

    const ui = commands.find(c => c.type === 'ui_command')
    expect(ui).toBeDefined()
    expect(ui!.data.userid).toBe('KU_1')
    expect(ui!.data.cmd).toMatchObject({
      action: 'create', id: 'hpbars',
      follow: { mode: 'all', radius: 20, prefabs: ['spider', 'hound'], require_hp: true, offset_y: 50 },
      tree: {
        type: 'col',
        children: [
          { type: 'text', text: '?', bind: { text: 'entity.name' } },
          { type: 'bar', value: 1, max: 1, width: 60, height: 8, bind: { value: 'entity.hp', max: 'entity.hp_max' } },
        ],
      },
    })
    // the ui_* children are the template, NOT part of the command payload chain
    expect(commands.filter(c => c.type === 'ui_command').length).toBe(1)
    // and the next action after ui_track still runs (unlike ui_panel, which consumes its edges)
    expect(commands.some(c => c.type === 'announce' && c.data.message === 'next')).toBe(true)
  })

  it('without ui_* children there is no template and the legacy single-target follow is unchanged', async () => {
    const nodes = [trigger('t', 'player_spawn'), track('tr', { userid: 'u1', id: 'boss', prefab: 'deerclops', label: 'Boss' })]
    await run(nodes, [edge('t', 'tr')], { type: 'player_spawn', data: {} })
    const ui = commands.find(c => c.type === 'ui_command')
    expect(ui!.data.cmd).toMatchObject({ action: 'create', id: 'boss', type: 'progress_bar', follow: { prefab: 'deerclops' }, label: 'Boss' })
    expect(ui!.data.cmd.tree).toBeUndefined()
  })
})
