// The examples/flows/Online_Lista.dstp.json example, run for real through the engine:
// `!online` in chat → script (ctx.getPlayers → HTML via ctx.dom) → ui_builder renders
// that HTML through its runtime `html` param. Pins that the shipped example works.
//
// Run under `bun test` (from frontend/).
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository } from '../db'

type Cmd = { serverId: string; type: string; data: any }
const SERVER = `__test_online_${Date.now()}`
let engine: FlowEngine
let commands: Cmd[]

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

const PLAYERS = [
  { userid: 'KU_1', name: 'Joe', prefab: 'wilson', admin: true, health: { current: 80, max: 150 } },
  { userid: 'KU_2', name: 'Ana', prefab: 'willow', admin: false, health: { current: 120, max: 150 } },
]

beforeEach(() => {
  const repo = new FlowRepository(SERVER)
  for (const f of repo.findAll()) repo.delete(f.id)
  commands = []
  const host: EngineHost = {
    pushCommand: (serverId, type, data) => { commands.push({ serverId, type, data }) },
    getServerGroups: () => [{ server_id: SERVER, all_players: PLAYERS } as any],
    emitState: () => {},
    requestEventToggle: () => {},
    requestWatchKeys: () => {},
  }
  engine = new FlowEngine(host)
})

describe('example: !online list', () => {
  it('renders one row per player with icon, name and health bar, plus the close button', async () => {
    const flow = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'examples', 'flows', 'Online_Lista.dstp.json'), 'utf8'))
    new FlowRepository(SERVER).save({ id: 'online', name: flow.name, enabled: true, nodes: flow.nodes, edges: flow.edges })
    engine.evaluateEvent(SERVER, { type: 'chat_message', data: { userid: 'KU_1', name: 'Joe', message: '!online' } })
    await new Promise(r => setTimeout(r, 200))
    const cmd = commands.find(c => c.type === 'ui_command')?.data
    expect(cmd).toBeDefined()
    expect(cmd.userid).toBe('KU_1')
    const tree = cmd.cmd.tree
    expect(tree).toMatchObject({ type: 'panel', title: 'Online', width: 380 })
    const [total, lista, close] = tree.children
    expect(total.text).toBe('2 jogador(es) online')
    expect(lista).toMatchObject({ type: 'col', overflow: 'scroll', height: 220 })
    expect(lista.children).toHaveLength(2)
    const row = lista.children[0]
    expect(row.type).toBe('row')
    expect(row.children.map((c: any) => c.type)).toEqual(['icon', 'text', 'bar'])
    expect(row.children[0].prefab).toBe('wilson')
    expect(row.children[1].text).toBe('[ADM] Joe')
    expect(row.children[2]).toMatchObject({ value: 80, max: 150 })
    expect(lista.children[1].children[1].text).toBe('Ana')
    expect(close).toMatchObject({ type: 'button', callback: 'close', text: 'Fechar' })
  })

  it('does nothing for other chat messages', async () => {
    const flow = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'examples', 'flows', 'Online_Lista.dstp.json'), 'utf8'))
    new FlowRepository(SERVER).save({ id: 'online', name: flow.name, enabled: true, nodes: flow.nodes, edges: flow.edges })
    engine.evaluateEvent(SERVER, { type: 'chat_message', data: { userid: 'KU_1', message: 'oi' } })
    await new Promise(r => setTimeout(r, 100))
    expect(commands.find(c => c.type === 'ui_command')).toBeUndefined()
  })
})
