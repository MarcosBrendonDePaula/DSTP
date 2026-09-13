// ui_builder `cb:` handles with a wildcard: a tree button declared as
// callback="extra:*" catches every runtime click whose callback starts with "extra:"
// (buttons added later by dom_append / script-generated HTML), exposing the rest of
// the name as {{trigger.callback_rest}}. Exact names keep working as before.
//
// Run under `bun test`.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository, type FlowNode, type FlowEdge } from '../db'

type Cmd = { serverId: string; type: string; data: any }
const SERVER = `__test_cbwild_${Date.now()}`
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

const builder = (id: string, callbacks: string[]): FlowNode =>
  ({ id, type: 'ui_builder', data: { params: { userid: 'KU_1', id: 'ui' }, tree: { type: 'panel', children: callbacks.map(cb => ({ type: 'button', text: cb, callback: cb })) } }, position: { x: 0, y: 0 } } as any)
const action = (id: string, message: string): FlowNode =>
  ({ id, type: 'action', data: { action_type: 'announce', params: { message } }, position: { x: 0, y: 0 } } as any)
const edge = (source: string, target: string, sourceHandle: string): FlowEdge =>
  ({ id: `${source}->${target}`, source, target, sourceHandle } as any)

async function click(nodes: FlowNode[], edges: FlowEdge[], callback: string) {
  new FlowRepository(SERVER).save({ id: uid(), name: 'cb-wild', enabled: true, nodes, edges })
  engine.evaluateEvent(SERVER, { type: 'ui_callback', data: { userid: 'KU_1', callback } })
  await new Promise(r => setTimeout(r, 20))
}
const announced = () => commands.filter(c => c.type === 'announce').map(c => c.data.message)

describe('ui_builder cb: wildcard handles', () => {
  it('cb:extra:* catches extra:remover and exposes callback_rest', async () => {
    const nodes = [builder('ui', ['extra:*']), action('a', 'got {{trigger.callback}} rest={{trigger.callback_rest}}')]
    await click(nodes, [edge('ui', 'a', 'cb:extra:*')], 'extra:remover')
    expect(announced()).toEqual(['got extra:remover rest=remover'])
  })

  it('an exact handle still fires for its own name and the wildcard does not double-fire', async () => {
    const nodes = [builder('ui', ['ok', 'extra:*']), action('a', 'exact'), action('b', 'wild')]
    await click(nodes, [edge('ui', 'a', 'cb:ok'), edge('ui', 'b', 'cb:extra:*')], 'ok')
    expect(announced()).toEqual(['exact'])
  })

  it('the wildcard needs the prefix: "extra" alone and "other:x" do not match', async () => {
    const nodes = [builder('ui', ['extra:*']), action('a', 'wild')]
    await click(nodes, [edge('ui', 'a', 'cb:extra:*')], 'extra')
    await click(nodes, [edge('ui', 'a', 'cb:extra:*')], 'other:x')
    expect(announced()).toEqual([])
  })
})
