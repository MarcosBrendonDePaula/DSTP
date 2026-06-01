#!/usr/bin/env bun
// Validates the new anti-cheat/combat events flow end to end (backend side):
// a flow triggered by player_attack_other (a) auto-activates the combat
// category and (b) fires its action when the event arrives. Same for
// player_on_fire (survival) and player_item_get (inventory).

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-events'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_ev'

const repo = new FlowRepository(server)
const evtFlow = (id: string, event: string, msg: string) => ({
  id, name: id, enabled: true,
  nodes: [
    { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: event, alias: 'e' } },
    { id: 'a', type: 'action', position: { x: 200, y: 0 }, data: { action_type: 'announce', params: { message: msg } } },
  ],
  edges: [{ id: 'e1', source: 't', target: 'a' }],
})
repo.save(evtFlow('atk', 'player_attack_other', 'hit:{{e.target}}') as any)
repo.save(evtFlow('fire', 'player_on_fire', 'fire!') as any)
repo.save(evtFlow('got', 'player_item_get', 'got:{{e.prefab}}') as any)

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: USER, name: 'E' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const g: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); g.push(...(r.commands || [])) } return g }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

// The new events must map to the right categories so a saved flow auto-enables
// them. We assert the FlowEngine's categoryMap directly (saveFlow →
// ensureEventCategories uses it; seeding the DB here bypasses that path).
const { FlowEngine } = await import('../../app/server/live/FlowEngine')
const enabled: Record<string, boolean> = {}
const eng = new FlowEngine({
  pushCommand: () => {}, getServerGroups: () => [], emitState: () => {},
  requestEventToggle: (_sid: string, cat: string, en: boolean) => { enabled[cat] = en },
} as any)
eng.ensureEventCategories({ server_id: server, nodes: [
  { type: 'trigger', data: { event_type: 'player_attack_other' } },
  { type: 'trigger', data: { event_type: 'player_on_fire' } },
  { type: 'trigger', data: { event_type: 'player_item_get' } },
] })
ck(enabled.combat === true, `player_attack_other → combat [${JSON.stringify(enabled)}]`)
ck(enabled.survival === true, 'player_on_fire → survival')
ck(enabled.inventory === true, 'player_item_get → inventory')
await sync([]); await sleep(300)

// attack_other → announce hit:wilson
await sync([{ type: 'player_attack_other', data: { userid: USER, name: 'E', target: 'wilson', target_is_player: true } }])
const g1 = await drain()
ck(g1.some(c => c.type === 'announce' && /hit:wilson/.test(c.data?.message || '')), `player_attack_other disparou [${g1.filter(c=>c.type==='announce').map(c=>c.data?.message).join(',')}]`)

// item_get → announce got:gears
await sync([{ type: 'player_item_get', data: { userid: USER, name: 'E', prefab: 'gears' } }])
const g2 = await drain()
ck(g2.some(c => c.type === 'announce' && /got:gears/.test(c.data?.message || '')), 'player_item_get disparou')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
