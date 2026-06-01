#!/usr/bin/env bun
// Scale test: spin up N synthetic DST servers at once (each forces one worker
// core on the backend), all polling with events, and measure latency + loss.
//
// Run the backend separately (bun run dev), then:
//   bun run scripts/sim/scale-test.ts [N] [seconds] [eventsPerServerPerSec]
//
// Each server gets a death→respawn flow (seeded directly), then polls every
// `pollMs`, emitting `rate` deaths per second. We count respawns returned vs
// deaths sent, and time each sync. Memory is read separately (PowerShell) — the
// harness prints PIDs to watch.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const N = Number(process.argv[2] ?? 25)
const DURATION_S = Number(process.argv[3] ?? 15)
const RATE = Number(process.argv[4] ?? 1) // deaths/sec/server
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const POLL_MS = 1000

function seed(serverId: string) {
  const repo = new FlowRepository(serverId)
  repo.save({
    id: 'scale-death-respawn', name: 'scale: death→respawn', enabled: true,
    nodes: [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_death', alias: 'd' } },
      { id: 'a', type: 'action', position: { x: 300, y: 0 }, data: { action_type: 'respawn', params: { userid: '{{d.userid}}' } } },
    ],
    edges: [{ id: 'e', source: 't', target: 'a' }],
  })
}

class Server {
  id: string
  sent = 0
  drained = 0
  syncs = 0
  totalLatency = 0
  maxLatency = 0
  inflight: any[] = []
  constructor(i: number) { this.id = `scale-${i}` }

  body(events: any[]) {
    return {
      server_id: this.id, shard_id: `${this.id}:master`, shard_type: 'master',
      server: { name: this.id }, players: [{ userid: 'KU_s', name: 'S' }], events,
    }
  }

  async poll() {
    const events = this.inflight
    this.inflight = []
    this.sent += events.length
    const t = Date.now()
    try {
      const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.body(events)) })
      const json = await res.json() as any
      const dt = Date.now() - t
      this.syncs++; this.totalLatency += dt; if (dt > this.maxLatency) this.maxLatency = dt
      this.drained += (json.commands || []).length
    } catch { /* count as latency miss */ }
  }

  queueTick() {
    for (let i = 0; i < RATE; i++) this.inflight.push({ type: 'player_death', data: { userid: 'KU_s', seq: this.sent + this.inflight.length } })
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

console.log(`Scale test: ${N} servers, ${DURATION_S}s, ${RATE} death/s each (target ${N * RATE} ev/s total)`)
console.log('Seeding flows...')
const servers: Server[] = []
for (let i = 1; i <= N; i++) { seed(`scale-${i}`); servers.push(new Server(i)) }

console.log('Registering (spawns N worker cores)...')
await Promise.all(servers.map(s => s.poll()))
await sleep(500)

console.log('Running load...')
const t0 = Date.now()
let ticks = 0
while (Date.now() - t0 < DURATION_S * 1000) {
  const tickStart = Date.now()
  servers.forEach(s => s.queueTick())
  await Promise.all(servers.map(s => s.poll()))
  ticks++
  const elapsed = Date.now() - tickStart
  if (elapsed < POLL_MS) await sleep(POLL_MS - elapsed)
}

// Final drain rounds to collect commands still in flight.
for (let i = 0; i < 6; i++) { await sleep(300); await Promise.all(servers.map(s => s.poll())) }

const sent = servers.reduce((a, s) => a + s.sent, 0)
const drained = servers.reduce((a, s) => a + s.drained, 0)
const syncs = servers.reduce((a, s) => a + s.syncs, 0)
const avgLat = servers.reduce((a, s) => a + s.totalLatency, 0) / syncs
const maxLat = Math.max(...servers.map(s => s.maxLatency))
const totalTime = (Date.now() - t0) / 1000

console.log(`\n──── N=${N} ────`)
console.log(`Events sent:   ${sent}`)
console.log(`Respawns:      ${drained}`)
console.log(`Loss:          ${sent - drained} (${(((sent - drained) / sent) * 100).toFixed(1)}%)`)
console.log(`Throughput:    ${(drained / totalTime).toFixed(0)} cmd/s`)
console.log(`Sync latency:  avg ${avgLat.toFixed(0)}ms, max ${maxLat}ms  (${syncs} syncs)`)
process.exit(0)
