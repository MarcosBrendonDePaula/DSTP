// examples/flows/Pet_Chester.dstp.json through the real engine: a Chester spawns on
// player_spawn with a flow brain following its owner; spawn_result → memory (pet:<userid>
// ↔ owner:<guid>); brain_dead → respawn for the owner after the delay; player_left →
// the pet is killed and forgotten.
//
// Run under `bun test` (from frontend/).
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository, FlowMemoryRepository } from '../db'

type Cmd = { serverId: string; type: string; data: any }
const SERVER = `__test_pet_${Date.now()}`
const FLOW_ID = 'pet'
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
  const flow = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'examples', 'flows', 'Pet_Chester.dstp.json'), 'utf8'))
  repo.save({ id: FLOW_ID, name: flow.name, enabled: true, nodes: flow.nodes, edges: flow.edges })
})

const fire = async (type: string, data: any, ms = 150) => { engine.evaluateEvent(SERVER, { type, data }); await new Promise(r => setTimeout(r, ms)) }
const spawns = () => commands.filter(c => c.type === 'spawn_at_player').map(c => c.data)

describe('example: Pet Chester', () => {
  it('spawns a flow-brained chester that follows the joining player', async () => {
    await fire('player_spawn', { userid: 'KU_1', name: 'Joe' })
    const s = spawns()
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ userid: 'KU_1', prefab: 'chester', token: 'pet:KU_1' })
    const brain = JSON.parse(s[0].brain)
    expect(brain).toMatchObject({ mode: 'follow', target: 'KU_1' })
  })

  it('spawn_result → remembers pet:<userid> and owner:<guid>; brain_dead → respawn for the owner; player_left → kill + forget', async () => {
    await fire('spawn_result', { token: 'pet:KU_1', guid: 777, prefab: 'chester', x: 1, z: 2 })
    const mem = new FlowMemoryRepository(SERVER)
    expect(Number(mem.get(FLOW_ID, 'pet:KU_1'))).toBe(777)
    expect(String(mem.get(FLOW_ID, 'owner:777'))).toBe('KU_1')

    // the pet dies → after the delay a new chester spawns at the owner with the same brain
    await fire('brain_dead', { guid: 777, prefab: 'chester', mode: 'follow', killer_prefab: 'hound' }, 3600)
    const s = spawns()
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ userid: 'KU_1', prefab: 'chester', token: 'pet:KU_1' })
    expect(JSON.parse(s[0].brain).target).toBe('KU_1')

    // a non-chester death does nothing
    await fire('brain_dead', { guid: 5, prefab: 'spider', mode: 'attack' })
    expect(spawns()).toHaveLength(1)

    // the owner leaves → the pet is killed and forgotten
    await fire('player_left', { userid: 'KU_1' })
    const kill = commands.find(c => c.type === 'entity_kill')?.data
    expect(Number(kill?.guid)).toBe(777)
    expect(mem.get(FLOW_ID, 'pet:KU_1')).toBeFalsy()
  })
})
