#!/usr/bin/env bun
// Wave 3 path test: seed a flow that uses one of the new actions and confirm the
// command reaches the queue (the sim doesn't run the real ban/lightning — it
// proves flow → command works; the in-game EFFECT must be tested in DST).

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-w3'
const URL = 'http://127.0.0.1:3000/api/dst/sync'

new FlowRepository(server).save({
  id: 'w3-ban', name: 'w3: chat !ban → ban', enabled: true,
  nodes: [
    { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'c' } },
    { id: 'a', type: 'action', position: { x: 300, y: 0 }, data: { action_type: 'ban', params: { userid: '{{c.userid}}' } } },
  ],
  edges: [{ id: 'e', source: 't', target: 'a' }],
})

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: 'KU_bad', name: 'Griefer' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

await sync([]); await sleep(300)
await sync([{ type: 'chat_message', data: { userid: 'KU_bad', message: '!ban me' } }])
await sleep(600)
const drain = await sync([])
const banCmd = (drain.commands || []).find((c: any) => c.type === 'ban')

if (banCmd && banCmd.data?.userid === 'KU_bad') {
  console.log(`\x1b[32m✓ PASS\x1b[0m ban command reached queue:`, JSON.stringify(banCmd))
  process.exit(0)
} else {
  console.log(`\x1b[31m✗ FAIL\x1b[0m no ban command. got:`, JSON.stringify(drain.commands))
  process.exit(1)
}
