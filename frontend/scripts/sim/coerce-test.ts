#!/usr/bin/env bun
// Proves numeric coercion: a heal action with amount "100" (string, as the
// editor saves it) must reach the queue as amount: 100 (number), so the mod's
// DoDelta gets a real number. Also checks a templated number stays a number.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-coerce'
const URL = 'http://127.0.0.1:3000/api/dst/sync'

new FlowRepository(server).save({
  id: 'coerce', name: 'coerce test', enabled: true,
  nodes: [
    { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_attacked', alias: 'hit' } },
    // amount as a literal string "100" — the bug case
    { id: 'h', type: 'action', position: { x: 300, y: 0 }, data: { action_type: 'heal', params: { userid: '{{hit.userid}}', amount: '100' } } },
  ],
  edges: [{ id: 'e', source: 't', target: 'h' }],
})

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: 'KU_p', name: 'P' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

await sync([]); await sleep(300)
await sync([{ type: 'player_attacked', data: { userid: 'KU_p', damage_resolved: 10 } }])
await sleep(600)
const drain = await sync([])
const heal = (drain.commands || []).find((c: any) => c.type === 'heal')

if (!heal) { console.log('\x1b[31m✗ FAIL\x1b[0m no heal command'); process.exit(1) }
const amt = heal.data?.amount
const isNum = typeof amt === 'number'
console.log(`heal.amount = ${JSON.stringify(amt)} (typeof ${typeof amt})`)
if (isNum && amt === 100) {
  console.log('\x1b[32m✓ PASS\x1b[0m amount coerced to number 100 (mod DoDelta will work)')
  process.exit(0)
} else {
  console.log(`\x1b[31m✗ FAIL\x1b[0m amount is not number 100 — still ${typeof amt}`)
  process.exit(1)
}
