import { describe, it, expect } from 'vitest'
import { analyzeFlow } from './FlowAnalyzer'
import type { FlowNode, FlowEdge } from '../db'

// Minimal node/edge builders — only the fields analyzeFlow reads.
const node = (id: string, type: string): FlowNode =>
  ({ id, type, data: {}, position: { x: 0, y: 0 } } as any)
const edge = (source: string, target: string): FlowEdge =>
  ({ id: `${source}->${target}`, source, target } as any)

describe('analyzeFlow', () => {
  it('marks a flow with no wait nodes as simple', () => {
    const flow = {
      nodes: [node('t1', 'trigger'), node('a1', 'action')],
      edges: [edge('t1', 'a1')],
    }
    const r = analyzeFlow(flow)
    expect(r.isSimple).toBe(true)
    expect(r.waitNodes).toEqual([])
  })

  it('marks a flow with a wait node as stateful', () => {
    const flow = {
      nodes: [node('t1', 'trigger'), node('w1', 'wait'), node('a1', 'action')],
      edges: [edge('t1', 'w1'), edge('w1', 'a1')],
    }
    const r = analyzeFlow(flow)
    expect(r.isSimple).toBe(false)
    expect(r.waitNodes).toHaveLength(1)
    expect(r.waitNodes[0].nodeId).toBe('w1')
  })

  it('finds the single upstream trigger of a wait node', () => {
    const flow = {
      nodes: [node('t1', 'trigger'), node('c1', 'condition'), node('w1', 'wait')],
      edges: [edge('t1', 'c1'), edge('c1', 'w1')],
    }
    const r = analyzeFlow(flow)
    expect(r.waitNodes[0].requiredTriggers).toEqual(['t1'])
  })

  it('finds MULTIPLE triggers that can reach the same wait (merge case)', () => {
    // t1 ─┐
    //     ├─> w1
    // t2 ─┘
    const flow = {
      nodes: [node('t1', 'trigger'), node('t2', 'trigger'), node('w1', 'wait')],
      edges: [edge('t1', 'w1'), edge('t2', 'w1')],
    }
    const r = analyzeFlow(flow)
    expect(r.waitNodes[0].requiredTriggers.sort()).toEqual(['t1', 't2'])
  })

  it('handles multiple wait nodes independently', () => {
    const flow = {
      nodes: [node('t1', 'trigger'), node('w1', 'wait'), node('t2', 'trigger'), node('w2', 'wait')],
      edges: [edge('t1', 'w1'), edge('t2', 'w2')],
    }
    const r = analyzeFlow(flow)
    expect(r.isSimple).toBe(false)
    expect(r.waitNodes).toHaveLength(2)
    const w1 = r.waitNodes.find(w => w.nodeId === 'w1')!
    const w2 = r.waitNodes.find(w => w.nodeId === 'w2')!
    expect(w1.requiredTriggers).toEqual(['t1'])
    expect(w2.requiredTriggers).toEqual(['t2'])
  })

  it('does not infinite-loop on a cycle in the graph', () => {
    // a -> b -> a  (cycle), plus t1 -> a, and a wait downstream
    const flow = {
      nodes: [node('t1', 'trigger'), node('a', 'action'), node('b', 'action'), node('w1', 'wait')],
      edges: [edge('t1', 'a'), edge('a', 'b'), edge('b', 'a'), edge('a', 'w1')],
    }
    const r = analyzeFlow(flow)
    // The visited-set must prevent infinite recursion and still find t1.
    expect(r.waitNodes[0].requiredTriggers).toEqual(['t1'])
  })

  it('returns no triggers for a wait with no upstream trigger', () => {
    const flow = {
      nodes: [node('a1', 'action'), node('w1', 'wait')],
      edges: [edge('a1', 'w1')],
    }
    const r = analyzeFlow(flow)
    expect(r.waitNodes[0].requiredTriggers).toEqual([])
  })
})
