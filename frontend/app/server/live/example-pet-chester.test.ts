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
  it('first join (no memory) spawns a flow-brained chester in collect mode', async () => {
    await fire('player_spawn', { userid: 'KU_1', name: 'Joe' })
    const s = spawns()
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ userid: 'KU_1', prefab: 'chester', token: 'pet:KU_1' })
    const brain = JSON.parse(s[0].brain)
    expect(brain).toMatchObject({ mode: 'collect', target: 'KU_1' })
  })

  it('spawn_result → remembers pet:<userid> and owner:<guid>; brain_dead → respawn for the owner; player_left → kill + forget', async () => {
    await fire('spawn_result', { token: 'pet:KU_1', guid: 777, prefab: 'chester', x: 1, z: 2 })
    const mem = new FlowMemoryRepository(SERVER)
    expect(Number(mem.get(FLOW_ID, 'pet:KU_1'))).toBe(777)
    expect(String(mem.get(FLOW_ID, 'owner:777'))).toBe('KU_1')
    // the flow, not the world config, decides the pet's size: 16 slots right after spawn
    const slotsCmd = commands.find(c => c.type === 'entity_set_slots')?.data
    expect(Number(slotsCmd?.guid)).toBe(777)
    expect(Number(slotsCmd?.slots)).toBe(16)

    // the pet dies → after the delay a new chester spawns at the owner with the same brain
    await fire('brain_dead', { guid: 777, prefab: 'chester', mode: 'follow', killer_prefab: 'hound' }, 3600)
    const s = spawns()
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ userid: 'KU_1', prefab: 'chester', token: 'pet:KU_1' })
    expect(JSON.parse(s[0].brain).target).toBe('KU_1')

    // a non-chester death does nothing
    await fire('brain_dead', { guid: 5, prefab: 'spider', mode: 'attack' })
    expect(spawns()).toHaveLength(1)

    // the owner leaves → the pet is PARKED (stay), items kept, memory kept
    await fire('player_left', { userid: 'KU_1' })
    const park = commands.find(c => c.type === 'entity_set_brain')?.data
    expect(park).toMatchObject({ guid: 777, mode: 'stay' })
    expect(commands.find(c => c.type === 'entity_kill')).toBeUndefined()
    expect(Number(mem.get(FLOW_ID, 'pet:KU_1'))).toBe(777)

    // the owner comes back → the flow probes the remembered pet (get_entity) instead of spawning
    commands.length = 0
    await fire('player_spawn', { userid: 'KU_1', name: 'Joe' })
    expect(commands.find(c => c.type === 'get_entity')?.data).toMatchObject({ guid: 777, token: 'pet:KU_1' })
    expect(spawns()).toHaveLength(0)
    // still alive → re-bind collect mode on the same pet
    await fire('entity_data', { token: 'pet:KU_1', found: true, guid: 777, prefab: 'chester' })
    expect(commands.filter(c => c.type === 'entity_set_brain').pop()?.data).toMatchObject({ guid: 777, mode: 'collect', target: 'KU_1' })
    expect(spawns()).toHaveLength(0)
    // the guid now belongs to something ELSE (guids are re-used across world loads) → spawn, never re-bind
    await fire('entity_data', { token: 'pet:KU_1', found: true, guid: 777, prefab: 'inventoryitem_classified' })
    expect(commands.filter(c => c.type === 'entity_set_brain').length).toBe(1)
    expect(spawns()).toHaveLength(1)
    commands.length = 0
    // gone (stale guid) → spawn a fresh one
    await fire('entity_data', { token: 'pet:KU_1', found: false, reason: 'gone' })
    expect(spawns()).toHaveLength(1)
    expect(spawns()[0]).toMatchObject({ userid: 'KU_1', prefab: 'chester', token: 'pet:KU_1' })
  })

  it('brain_restored after a world load refreshes the memory with the NEW guid', async () => {
    const mem = new FlowMemoryRepository(SERVER)
    await fire('brain_restored', { guid: 4242, prefab: 'chester', mode: 'collect', target_userid: 'KU_1' })
    expect(Number(mem.get(FLOW_ID, 'pet:KU_1'))).toBe(4242)
    expect(String(mem.get(FLOW_ID, 'owner:4242'))).toBe('KU_1')
    await fire('brain_restored', { guid: 5, prefab: 'spider', mode: 'stay' })
    expect(Number(mem.get(FLOW_ID, 'pet:KU_1'))).toBe(4242)
  })
})
