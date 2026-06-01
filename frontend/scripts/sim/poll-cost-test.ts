#!/usr/bin/env bun
// Measures the backend-side cost of an IDLE server polling at a given interval.
// No events, no players doing anything — just the empty heartbeat poll, to see
// what 0.1s vs 1s costs when nothing is happening.
//
// Usage: bun run scripts/sim/poll-cost-test.ts <intervalMs> <seconds>

const URL = 'http://127.0.0.1:3000/api/dst/sync'
const intervalMs = Number(process.argv[2] ?? 100)
const durationS = Number(process.argv[3] ?? 10)
const server = 'poll-cost'

function sync() {
  const t = performance.now()
  return fetch(URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server_id: server, shard_id: `${server}:master`, shard_type: 'master',
      server: { name: server, phase: 'day' },
      players: [{ userid: 'KU_idle', name: 'Idle' }],
      events: [],
    }),
  }).then(async r => { await r.json(); return performance.now() - t })
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

console.log(`Idle poll cost: interval=${intervalMs}ms over ${durationS}s`)
await sync(); await sleep(200)

let count = 0
let totalLat = 0
let maxLat = 0
const t0 = Date.now()
while (Date.now() - t0 < durationS * 1000) {
  const start = Date.now()
  const lat = await sync()
  count++; totalLat += lat; if (lat > maxLat) maxLat = lat
  const elapsed = Date.now() - start
  if (elapsed < intervalMs) await sleep(intervalMs - elapsed)
}
const wall = (Date.now() - t0) / 1000

console.log(`  polls:        ${count} (${(count / wall).toFixed(1)}/s)`)
console.log(`  avg latency:  ${(totalLat / count).toFixed(1)}ms`)
console.log(`  max latency:  ${maxLat.toFixed(1)}ms`)
process.exit(0)
