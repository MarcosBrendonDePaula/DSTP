#!/usr/bin/env bun
// Validates the night-hunt flow path on a sim server: a kill at night must
// produce ui_command (notification) + give_item(count=2 number) + heal(amount=50
// number). A kill by DAY must produce none of them.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-hunt'
const URL = 'http://127.0.0.1:3000/api/dst/sync'

// seed the same flow into the sim server
const repo = new FlowRepository(server)
repo.save({
  id: 'night-hunt', name: 'night hunt', enabled: true,
  nodes: [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_kill', alias: 'kill' } },
    { id: 'getp', type: 'get_player', position: { x: 200, y: 0 }, data: { params: { userid: '{{kill.userid}}' }, alias: 'p' } },
    { id: 'cond', type: 'condition', position: { x: 400, y: 0 }, data: { field: 'phase', operator: 'equals', value: 'night' } },
    { id: 'notify', type: 'action', position: { x: 600, y: -100 }, data: { action_type: 'ui_notification', params: { userid: '{{kill.userid}}', text: 'Caca: {{kill.victim}}', duration: '6' } } },
    { id: 'gold', type: 'action', position: { x: 600, y: 0 }, data: { action_type: 'give_item', params: { userid: '{{kill.userid}}', prefab: 'goldnugget', count: '2' } } },
    { id: 'heal', type: 'action', position: { x: 600, y: 100 }, data: { action_type: 'heal', params: { userid: '{{kill.userid}}', amount: '50' } } },
  ],
  edges: [
    { id: 'e1', source: 'trg', target: 'getp' },
    { id: 'e2', source: 'getp', target: 'cond' },
    { id: 'e3', source: 'cond', target: 'notify', sourceHandle: 'true' },
    { id: 'e4', source: 'cond', target: 'gold', sourceHandle: 'true' },
    { id: 'e5', source: 'cond', target: 'heal', sourceHandle: 'true' },
  ],
})

function sync(phase: string, events: any[]) {
  return fetch(URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase }, players: [{ userid: 'KU_h', name: 'Hunter', health: { current: 50, max: 150 } }], events }),
  }).then(r => r.json() as Promise<any>)
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drainAll = async (phase: string) => { const got: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync(phase, []); got.push(...(r.commands || [])) } return got }

let pass = 0, fail = 0
const check = (c: boolean, msg: string) => { if (c) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); pass++ } else { console.log(`\x1b[31m✗\x1b[0m ${msg}`); fail++ } }

// register
await sync('night', []); await sleep(300)

// 1) kill at NIGHT
await sync('night', [{ type: 'player_kill', data: { userid: 'KU_h', victim: 'spider' } }])
const night = await drainAll('night')
check(night.some(c => c.type === 'ui_command'), 'night: ui_notification enviada')
const give = night.find(c => c.type === 'give_item')
check(!!give && give.data?.count === 2 && typeof give.data.count === 'number', `night: give_item count=2 (number) [got ${JSON.stringify(give?.data?.count)}]`)
const heal = night.find(c => c.type === 'heal')
check(!!heal && heal.data?.amount === 50 && typeof heal.data.amount === 'number', `night: heal amount=50 (number) [got ${JSON.stringify(heal?.data?.amount)}]`)

// 2) kill by DAY → nothing
await sync('day', [{ type: 'player_kill', data: { userid: 'KU_h', victim: 'rabbit' } }])
const day = await drainAll('day')
check(!day.some(c => ['ui_command', 'give_item', 'heal'].includes(c.type)), 'day: nenhuma recompensa (condição night barrou)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
