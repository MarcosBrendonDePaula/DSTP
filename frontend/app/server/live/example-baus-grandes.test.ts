// examples/flows/Baus_Grandes.dstp.json through the real engine: a placed chest
// (structure_built, no guid — prefab + x/z) gets entity_set_slots 25 by prefab+position;
// the entity_slots ack PMs the builder. Run under `bun test` (from frontend/).
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository } from '../db'

type Cmd = { serverId: string; type: string; data: any }
const SERVER = `__test_baus_${Date.now()}`
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
  const flow = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'examples', 'flows', 'Baus_Grandes.dstp.json'), 'utf8'))
  repo.save({ id: 'baus', name: flow.name, enabled: true, nodes: flow.nodes, edges: flow.edges })
})
const fire = async (type: string, data: any) => { engine.evaluateEvent(SERVER, { type, data }); await new Promise(r => setTimeout(r, 150)) }

describe('example: Baús grandes', () => {
  it('a placed treasurechest → entity_set_slots by prefab + position, 25 slots', async () => {
    await fire('structure_built', { userid: 'KU_1', name: 'Joe', prefab: 'treasurechest', x: 10, z: -20 })
    const d = commands.find(c => c.type === 'entity_set_slots')?.data
    expect(d).toBeDefined()
    expect(d.prefab).toBe('treasurechest')
    expect(Number(d.x)).toBe(10); expect(Number(d.z)).toBe(-20)
    expect(Number(d.slots)).toBe(25)
    expect(d.token).toBe('chest:KU_1')
  })
  it('other structures are ignored; the ack PMs the builder', async () => {
    await fire('structure_built', { userid: 'KU_1', prefab: 'firepit', x: 1, z: 1 })
    expect(commands.find(c => c.type === 'entity_set_slots')).toBeUndefined()
    await fire('entity_slots', { token: 'chest:KU_1', ok: true, prefab: 'treasurechest', slots: 25, guid: 500 })
    const pm = commands.find(c => c.type === 'private_message')?.data
    expect(pm).toMatchObject({ userid: 'KU_1' })
    expect(String(pm.message)).toContain('25')
  })
})
