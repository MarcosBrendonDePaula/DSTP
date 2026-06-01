#!/usr/bin/env bun
// Watchdog test: hang a server's core with a long busy-loop script, then verify
// the manager detects the hang (~8s), respawns the core, and the SAME server
// processes a fresh event afterward — i.e. it recovers on its own.

const URL = 'http://127.0.0.1:3000/api/dst/sync'
const server = process.argv[2] ?? 'sim-wd'

function sync(events: any[], players: any[] = [{ userid: 'KU_w', name: 'W' }]) {
  return fetch(URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server }, players, events }),
  }).then(r => r.json() as Promise<any>)
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

console.log(`1) register ${server}`)
await sync([]); await sleep(300)

console.log('2) fire chat → triggers the slow-script (busy-loop), hanging the core')
await sync([{ type: 'chat_message', data: { userid: 'KU_w', message: 'hang' } }])

console.log('3) wait ~12s for watchdog to detect hang + respawn...')
await sleep(12000)

console.log('4) fire a death on the SAME server — should be handled by the respawned core')
await sync([{ type: 'player_death', data: { userid: 'KU_w', cause: 'spider' } }])
await sleep(800)
const drain = await sync([])
const gotRespawn = (drain.commands || []).some((c: any) => c.type === 'respawn')

console.log(`   respawn after recovery: ${gotRespawn}`)
if (gotRespawn) {
  console.log('\x1b[32m✓ PASS\x1b[0m core recovered from hang and processed a new event')
  process.exit(0)
} else {
  console.log('\x1b[31m✗ FAIL\x1b[0m core did not recover (still hung or events lost)')
  process.exit(1)
}
