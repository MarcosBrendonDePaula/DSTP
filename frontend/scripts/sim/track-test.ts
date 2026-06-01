#!/usr/bin/env bun
// Validates the ui_track action emits a follow widget command. The actual
// world→screen tracking is client-side Lua (only testable in-game); here we
// confirm the backend produces the right ui_command with a `follow` block.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-track'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_tr'

new FlowRepository(server).save({
  id: 'track', name: 'track boss', enabled: true,
  nodes: [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'boss_event', alias: 'b' } },
    { id: 'ui', type: 'action', position: { x: 200, y: 0 }, data: { action_type: 'ui_track', params: {
      userid: '{{b.userid}}', id: 'boss_hp', prefab: 'deerclops', label: 'Deerclops',
      max_dist: '50', offset_y: '70', width: '120', color: '[0.9,0.2,0.2,1]',
    } } },
  ],
  edges: [{ id: 'e1', source: 'trg', target: 'ui' }],
})

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: USER, name: 'T' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const g: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); g.push(...(r.commands || [])) } return g }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

await sync([]); await sleep(300)
await sync([{ type: 'boss_event', data: { userid: USER, name: 'T', boss: 'deerclops' } }])
const got = await drain()
const c = got.find(x => x.type === 'ui_command' && x.data?.cmd?.follow)?.data?.cmd
ck(!!c, `ui_command com follow emitido [tipos: ${[...new Set(got.map(x => x.type))].join(',')}]`)
ck(c?.id === 'boss_hp', `id boss_hp [${c?.id}]`)
ck(c?.follow?.prefab === 'deerclops', `follow.prefab deerclops [${c?.follow?.prefab}]`)
ck(c?.follow?.max_dist === 50 && c?.follow?.offset_y === 70, `dist/offset [${c?.follow?.max_dist}/${c?.follow?.offset_y}]`)
ck(c?.label === 'Deerclops', `label [${c?.label}]`)
ck(Array.isArray(c?.color) && c.color[0] === 0.9, `color parseada [${JSON.stringify(c?.color)}]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
