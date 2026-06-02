import { describe, it, expect } from 'vitest'
import { createLoopGuard, recordVisit, MAX_NODE_VISITS, MAX_TOTAL_STEPS } from './loop-guard'

describe('loop guard', () => {
  it('allows a node to run a normal number of times', () => {
    const g = createLoopGuard()
    // A node revisited by a few convergent branches must NOT trip the guard.
    for (let i = 0; i < 5; i++) {
      expect(recordVisit(g, 'A').ok).toBe(true)
    }
    expect(g.aborted).toBe(false)
  })

  it('allows distinct nodes without tripping (counts are per-node)', () => {
    const g = createLoopGuard()
    for (let i = 0; i < 100; i++) {
      expect(recordVisit(g, `node_${i}`).ok).toBe(true)
    }
    expect(g.aborted).toBe(false)
  })

  it('trips when one node repeats past MAX_NODE_VISITS (cycle)', () => {
    const g = createLoopGuard()
    let tripped = null as any
    for (let i = 0; i < MAX_NODE_VISITS + 5; i++) {
      const r = recordVisit(g, 'loopy')
      if (r.tripped) { tripped = r.tripped; break }
    }
    expect(tripped).not.toBeNull()
    expect(tripped.nodeId).toBe('loopy')
    expect(tripped.visits).toBe(MAX_NODE_VISITS + 1)
    expect(tripped.reason).toMatch(/cycle/i)
    expect(g.aborted).toBe(true)
  })

  it('stays aborted: every call after a trip returns ok:false with no new trip', () => {
    const g = createLoopGuard()
    for (let i = 0; i <= MAX_NODE_VISITS; i++) recordVisit(g, 'loopy')
    expect(g.aborted).toBe(true)
    const after = recordVisit(g, 'loopy')
    expect(after.ok).toBe(false)
    expect(after.tripped).toBeUndefined() // already tripped, not re-reported
  })

  it('trips on total steps even without any single node cycling (runaway)', () => {
    // Use a low per-node cap so distinct nodes never trip per-node, but the
    // total-steps backstop fires. We simulate by using the real caps: visit
    // many DISTINCT nodes until total steps exceed MAX_TOTAL_STEPS.
    const g = createLoopGuard()
    let tripped = null as any
    for (let i = 0; i <= MAX_TOTAL_STEPS + 1; i++) {
      const r = recordVisit(g, `n_${i}`) // every node distinct → never per-node cycle
      if (r.tripped) { tripped = r.tripped; break }
    }
    expect(tripped).not.toBeNull()
    expect(tripped.reason).toMatch(/total steps/i)
    expect(tripped.steps).toBe(MAX_TOTAL_STEPS + 1)
  })

  it('respects custom caps', () => {
    const g = createLoopGuard()
    expect(recordVisit(g, 'X', 2).ok).toBe(true) // visit 1
    expect(recordVisit(g, 'X', 2).ok).toBe(true) // visit 2
    const third = recordVisit(g, 'X', 2)          // visit 3 > cap 2
    expect(third.ok).toBe(false)
    expect(third.tripped?.visits).toBe(3)
  })
})
