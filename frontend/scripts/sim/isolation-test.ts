#!/usr/bin/env bun
// Isolation test: a runaway script (while(true) for 60s) in one server's core
// must NOT stall other servers. We hang sim-3's core, then hit sim-1 and assert
// sim-1 still answers quickly.

const URL = 'http://127.0.0.1:3000/api/dst/sync'

function sync(serverId: string, events: any[], players: any[] = []) {
  return fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server_id: serverId,
      shard_id: `${serverId}:master`,
      shard_type: 'master',
      server: { name: serverId },
      players,
      events,
    }),
  }).then(r => r.json() as Promise<any>)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

console.log('1) Register both servers...')
await sync('sim-1', [], [{ userid: 'KU_alice', name: 'Alice' }])
await sync('sim-3', [], [{ userid: 'KU_carl', name: 'Carl' }])
await sleep(300)

console.log('2) Fire chat on sim-3 → triggers the 60s busy-loop script (hangs sim-3 core)')
await sync('sim-3', [{ type: 'chat_message', data: { userid: 'KU_carl', message: 'hang' } }], [{ userid: 'KU_carl', name: 'Carl' }])

console.log('3) Immediately fire death on sim-1 and time its response...')
const t0 = Date.now()
await sync('sim-1', [{ type: 'player_death', data: { userid: 'KU_alice', cause: 'spider' } }], [{ userid: 'KU_alice', name: 'Alice' }])
await sleep(400)
// drain sim-1
const drain = await sync('sim-1', [], [{ userid: 'KU_alice', name: 'Alice' }])
const elapsed = Date.now() - t0

const gotRespawn = (drain.commands || []).some((c: any) => c.type === 'respawn')
console.log(`   sim-1 round-trip: ${elapsed}ms, respawn received: ${gotRespawn}`)

if (gotRespawn && elapsed < 5000) {
  console.log('\x1b[32m✓ PASS\x1b[0m sim-1 responded normally while sim-3 core was hung')
  process.exit(0)
} else {
  console.log('\x1b[31m✗ FAIL\x1b[0m sim-1 was affected by sim-3 hanging (elapsed=' + elapsed + 'ms, respawn=' + gotRespawn + ')')
  process.exit(1)
}
