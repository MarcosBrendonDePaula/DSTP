// script node + server-side DOM (task 11): `context.dom(html)` gives a jsdom document,
// `context.html(doc)` serializes it back, and a downstream ui_builder renders that HTML
// through its runtime `html` param — the "script area" is the backend, the client only
// gets tree JSON. Engine e2e under `bun test`.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository, type FlowNode, type FlowEdge } from '../db'

type Cmd = { serverId: string; type: string; data: any }
const SERVER = `__test_scriptdom_${Date.now()}`
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

const node = (id: string, type: string, data: any): FlowNode => ({ id, type, data, position: { x: 0, y: 0 } } as any)
const edge = (source: string, target: string): FlowEdge => ({ id: `${source}->${target}`, source, target } as any)

async function run(nodes: FlowNode[], edges: FlowEdge[], event: any) {
  new FlowRepository(SERVER).save({ id: uid(), name: 'script-dom', enabled: true, nodes, edges })
  engine.evaluateEvent(SERVER, event)
  await new Promise(r => setTimeout(r, 150))
}

describe('script node — context.dom / context.html → ui_builder html', () => {
  it('builds a catalogue with createElement and the ui_builder renders it', async () => {
    const code = `
      async function run(ctx) {
        const doc = await ctx.dom('<panel title="Loja" width="300"><div id="lista"></div></panel>')
        const list = doc.querySelector('#lista')
        for (const item of ctx.trigger.items) {
          const b = doc.createElement('button')
          b.setAttribute('callback', 'buy:' + item)
          b.textContent = 'Comprar ' + item
          list.appendChild(b)
        }
        return { html: ctx.html(doc), count: list.children.length }
      }`
    const nodes = [
      node('t', 'trigger', { event_type: 'player_spawn' }),
      node('s', 'script', { alias: 's', params: { code } }),
      node('ui', 'ui_builder', { params: { userid: '{{trigger.userid}}', id: 'loja', html: '{{s.html}}' }, tree: { type: 'panel', title: 'static', children: [] } }),
    ]
    await run(nodes, [edge('t', 's'), edge('s', 'ui')], { type: 'player_spawn', data: { userid: 'KU_1', items: ['log', 'rocks'] } })
    const cmd = commands.find(c => c.type === 'ui_command')?.data?.cmd
    expect(cmd).toBeDefined()
    expect(cmd.tree).toMatchObject({ type: 'panel', title: 'Loja', width: 300 })
    const list = cmd.tree.children[0]
    expect(list.children.map((c: any) => c.callback)).toEqual(['buy:log', 'buy:rocks'])
    expect(list.children[1].text).toBe('Comprar rocks')
  })
})
