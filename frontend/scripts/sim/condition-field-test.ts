#!/usr/bin/env bun
// Verifies the condition `field` accepts {{template}}, raw path, and plain key.
// A chat "morri" with `field contains morri` must be TRUE in all three forms.
// We wire each condition to a distinct action so we can tell which fired.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-cond'
const URL = 'http://127.0.0.1:3000/api/dst/sync'

function condFlow(id: string, field: string, actionType: string) {
  return {
    id, name: id, enabled: true,
    nodes: [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
      { id: 'c', type: 'condition', position: { x: 200, y: 0 }, data: { field, operator: 'contains', value: 'morri' } },
      { id: 'a', type: 'action', position: { x: 400, y: 0 }, data: { action_type: actionType, params: { message: `hit:${id}` } } },
    ],
    edges: [{ id: 'e1', source: 't', target: 'c' }, { id: 'e2', source: 'c', target: 'a', sourceHandle: 'true' }],
  }
}
const repo = new FlowRepository(server)
repo.save(condFlow('cf-template', '{{tm.message}}', 'announce') as any)
repo.save(condFlow('cf-path', 'tm.message', 'chat_send') as any)
repo.save(condFlow('cf-plain', 'message', 'private_message') as any)

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: 'KU_c', name: 'C' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

await sync([]); await sleep(300)
await sync([{ type: 'chat_message', data: { userid: 'KU_c', name: 'C', message: 'morri' } }])
const got: any[] = []
for (let i = 0; i < 5; i++) { await sleep(250); const r = await sync([]); got.push(...(r.commands || [])) }
const types = new Set(got.map(c => c.type))

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }
ck(types.has('announce'), 'field {{tm.message}} contains morri → true (announce)')
ck(types.has('chat_send'), 'field tm.message contains morri → true (chat_send)')
ck(types.has('private_message'), 'field message contains morri → true (private_message)')
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
