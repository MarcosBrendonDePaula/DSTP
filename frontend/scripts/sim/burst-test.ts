#!/usr/bin/env bun
// Burst stress test: fire many events at one server's core as fast as possible
// and measure loss, latency, and whether the core keeps up.
//
// Each player_death triggers the death→respawn flow → 1 respawn command.
// So N death events should yield N respawn commands (minus any that the queue
// drops or the worker loses). We send them in batches inside sync payloads
// (like the mod batches events), then drain and count.
//
// Usage: bun run scripts/sim/burst-test.ts [server] [totalEvents] [perSync]

const URL = 'http://127.0.0.1:3000/api/dst/sync'
const server = process.argv[2] ?? 'sim-burst'
const TOTAL = Number(process.argv[3] ?? 2000)
const PER_SYNC = Number(process.argv[4] ?? 50)

function sync(events: any[], players: any[] = [{ userid: 'KU_x', name: 'X' }]) {
  return fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server_id: server, shard_id: `${server}:master`, shard_type: 'master',
      server: { name: server }, players, events,
    }),
  }).then(r => r.json() as Promise<any>)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

console.log(`Burst: ${TOTAL} player_death events to "${server}" in batches of ${PER_SYNC}`)

// register
await sync([])
await sleep(200)

let drained = 0
let maxRespInFlight = 0
const t0 = Date.now()
let slowestSync = 0

// Fire all events, draining commands as they come back on each sync response.
let sent = 0
while (sent < TOTAL) {
  const n = Math.min(PER_SYNC, TOTAL - sent)
  const events = Array.from({ length: n }, (_, i) => ({
    type: 'player_death', data: { userid: 'KU_x', cause: 'b', seq: sent + i },
  }))
  const ts = Date.now()
  const res = await sync(events)
  const dt = Date.now() - ts
  if (dt > slowestSync) slowestSync = dt
  const cmds = (res.commands || []).length
  drained += cmds
  if (cmds > maxRespInFlight) maxRespInFlight = cmds
  sent += n
}

// Keep draining until quiet (commands produced async by fire-and-forget flows).
let quiet = 0
while (quiet < 5) {
  await sleep(150)
  const res = await sync([])
  const cmds = (res.commands || []).length
  drained += cmds
  if (cmds === 0) quiet++
  else quiet = 0
}

const elapsed = Date.now() - t0

console.log(`\nSent:            ${TOTAL} events`)
console.log(`Respawns drained:${drained}`)
console.log(`Loss:            ${TOTAL - drained} (${(((TOTAL - drained) / TOTAL) * 100).toFixed(1)}%)`)
console.log(`Total time:      ${elapsed}ms  (${(TOTAL / (elapsed / 1000)).toFixed(0)} events/s)`)
console.log(`Slowest sync:    ${slowestSync}ms`)
console.log(`Max cmds/sync:   ${maxRespInFlight}`)

if (drained >= TOTAL) {
  console.log('\x1b[32m✓ No loss — every event produced its command\x1b[0m')
} else if (drained >= TOTAL * 0.99) {
  console.log('\x1b[33m~ Near-complete (<1% loss)\x1b[0m')
} else {
  console.log('\x1b[31m✗ Significant loss — backpressure/queue dropped events\x1b[0m')
}
process.exit(0)
