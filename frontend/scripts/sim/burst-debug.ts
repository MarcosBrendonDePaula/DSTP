#!/usr/bin/env bun
// Focused diagnosis: send a batch, wait for the worker to drain, then drain.
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const server = process.argv[2] ?? 'sim-burst'
const N = Number(process.argv[3] ?? 100)

function sync(events: any[]) {
  return fetch(URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server }, players: [{ userid: 'KU_x', name: 'X' }], events }),
  }).then(r => r.json() as Promise<any>)
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

await sync([]); await sleep(300)

console.log(`Send ${N} deaths in ONE sync, then wait and drain repeatedly...`)
const r0 = await sync(Array.from({ length: N }, (_, i) => ({ type: 'player_death', data: { userid: 'KU_x', seq: i } })))
console.log(`immediate drain (same sync): ${(r0.commands || []).length} cmds`)

let total = (r0.commands || []).length
for (let i = 0; i < 10; i++) {
  await sleep(300)
  const r = await sync([])
  const c = (r.commands || []).length
  total += c
  console.log(`  drain #${i + 1} after ${(i + 1) * 300}ms: ${c} cmds (total ${total})`)
  if (c === 0 && i > 2) break
}
console.log(`\nTotal drained: ${total} / ${N}  (loss ${N - total})`)
process.exit(0)
