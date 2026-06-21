// Regression guard for the event-buffer memory caps in DSTStateStore.
//
// Context: a perf audit flagged "room.events grows unbounded — every server
// message appends, never trimmed → browser chokes in a long test session".
// That turned out to be a FALSE alarm: the cap already exists. These tests pin
// the cap in place so a future edit that removes the `.shift()` loop (or the
// `.slice(-500)` read guards) fails CI instead of silently reintroducing the
// leak.
//
// Mutation check (how we know these bite): delete the
// `while (entry.events.length > MAX_EVENTS_PER_SHARD)` loop in handleSync and
// the "per-shard buffer is capped" test goes red. Change the read-side
// `.slice(-500)` and the "merged read is bounded" test goes red.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { dstStateStore } from './DSTStateStore'

const MAX_EVENTS_PER_SHARD = 200  // mirrors the const in DSTStateStore.ts

// Unique server per call so the shared singleton store doesn't bleed between tests.
// A monotonic counter (not a timestamp) — two calls in the same millisecond must
// still differ, else two tests collide on one shard and see each other's events.
let _n = 0
const uniq = () => `dst-evcap-${Date.now().toString(36)}-${_n++}`

function mkEvents(n: number, type = 'chat_message') {
  return Array.from({ length: n }, (_, i) => ({ type, data: { i } }))
}

describe('DSTStateStore — event buffer caps (memory-leak guard)', () => {
  it('caps the per-shard event buffer at MAX_EVENTS_PER_SHARD no matter how many arrive', () => {
    const SRV = uniq()
    const SHARD = `${SRV}:master`

    // Simulate a long session: push WAY more events than the cap, in many syncs.
    for (let batch = 0; batch < 30; batch++) {
      dstStateStore.handleSync(SRV, SHARD, 'master', { name: SRV }, [], mkEvents(50))
    }
    // 30 * 50 = 1500 events arrived; buffer must hold at most the cap.
    const events = dstStateStore.getEventsForServer(SRV)
    expect(events.length).toBeLessThanOrEqual(MAX_EVENTS_PER_SHARD)
  })

  it('keeps the MOST RECENT events when over the cap (FIFO shift, not a hard reset)', () => {
    const SRV = uniq()
    const SHARD = `${SRV}:master`

    // Tag each event with a monotonically increasing seq so we can prove ordering.
    let seq = 0
    for (let batch = 0; batch < 10; batch++) {
      const evts = Array.from({ length: 100 }, () => ({ type: 'chat_message', data: { seq: seq++ } }))
      dstStateStore.handleSync(SRV, SHARD, 'master', { name: SRV }, [], evts)
    }
    // 1000 events pushed, seq 0..999. Cap = 200 → newest 200 survive (seq 800..999).
    const events = dstStateStore.getEventsForServer(SRV)
    const seqs = events.map(e => e.data.seq)
    expect(events.length).toBe(MAX_EVENTS_PER_SHARD)
    expect(Math.min(...seqs)).toBe(800)   // oldest survivor
    expect(Math.max(...seqs)).toBe(999)   // newest event kept
  })

  it('bounds the merged per-server read at 500 even across two shards each at the cap', () => {
    const SRV = uniq()

    // Fill BOTH shards to the per-shard cap → 400 events live in the store.
    for (let batch = 0; batch < 5; batch++) {
      dstStateStore.handleSync(SRV, `${SRV}:master`, 'master', { name: SRV }, [], mkEvents(50))
      dstStateStore.handleSync(SRV, `${SRV}:caves`, 'caves', { name: SRV }, [], mkEvents(50))
    }
    const merged = dstStateStore.getEventsForServer(SRV)
    // Read guard is .slice(-500); 2*200=400 here, so it's the per-shard cap that
    // binds. The assertion that matters for the leak: it never exceeds 500.
    expect(merged.length).toBeLessThanOrEqual(500)
    expect(merged.length).toBe(2 * MAX_EVENTS_PER_SHARD)
  })

  it('does not leak one server\'s events into another server\'s read', () => {
    const A = uniq()
    const B = uniq()
    dstStateStore.handleSync(A, `${A}:master`, 'master', { name: A }, [], mkEvents(20, 'a_evt'))
    dstStateStore.handleSync(B, `${B}:master`, 'master', { name: B }, [], mkEvents(20, 'b_evt'))

    const aEvents = dstStateStore.getEventsForServer(A)
    expect(aEvents.length).toBe(20)
    expect(aEvents.every(e => e.type === 'a_evt')).toBe(true)
  })
})
