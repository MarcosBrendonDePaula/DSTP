// Tests for validateFlow — the gate for AI-generated (and hand-built) flows.
// Each case feeds a deliberately broken graph and asserts the right rule fires.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { validateFlow } from './validateFlow'
import type { FlowNode, FlowEdge } from '@server/db'

const node = (id: string, type: string, data: any = {}): FlowNode =>
  ({ id, type, data, position: { x: 0, y: 0 } }) as FlowNode
const edge = (id: string, source: string, target: string, sourceHandle?: string): FlowEdge =>
  ({ id, source, target, sourceHandle }) as FlowEdge

// A minimal valid flow: trigger → give_item.
function validFlow(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: [node('t1', 'trigger', { event_type: 'player_spawn' }), node('a1', 'give_item')],
    edges: [edge('e1', 't1', 'a1')],
  }
}

const rules = (r: { errors: any[]; warnings: any[] }) => [...r.errors, ...r.warnings].map((i) => i.rule)

describe('validateFlow', () => {
  it('accepts a minimal valid flow', () => {
    const f = validFlow()
    const res = validateFlow(f.nodes, f.edges)
    expect(res.ok).toBe(true)
    expect(res.errors).toHaveLength(0)
  })

  it('errors when there is no trigger', () => {
    const r = validateFlow([node('a1', 'give_item')], [])
    expect(r.ok).toBe(false)
    expect(rules(r)).toContain('flow.trigger')
  })

  it('errors on an unknown node type', () => {
    const r = validateFlow(
      [node('t1', 'trigger', { event_type: 'x' }), node('a1', 'teleportt')],
      [edge('e1', 't1', 'a1')],
    )
    expect(r.ok).toBe(false)
    expect(rules(r)).toContain('node.type')
  })

  it('errors on a trigger with no event_type', () => {
    const r = validateFlow([node('t1', 'trigger', {})], [])
    expect(rules(r)).toContain('trigger.event_type')
  })

  it('errors on a dangling edge (target missing)', () => {
    const f = validFlow()
    f.edges.push(edge('e2', 't1', 'ghost'))
    const r = validateFlow(f.nodes, f.edges)
    expect(r.ok).toBe(false)
    expect(rules(r)).toContain('edge.target')
  })

  it('errors on duplicate node ids', () => {
    const r = validateFlow(
      [node('t1', 'trigger', { event_type: 'x' }), node('t1', 'give_item')],
      [],
    )
    expect(rules(r)).toContain('node.id.unique')
  })

  it('accepts a condition wired with true/false handles', () => {
    const r = validateFlow(
      [
        node('t1', 'trigger', { event_type: 'x' }),
        node('c1', 'condition', { field: 'a', operator: 'equals', value: '1' }),
        node('a1', 'give_item'),
        node('a2', 'kick'),
      ],
      [edge('e1', 't1', 'c1'), edge('e2', 'c1', 'a1', 'true'), edge('e3', 'c1', 'a2', 'false')],
    )
    expect(r.ok).toBe(true)
  })

  it('errors on an invalid branch handle (typo)', () => {
    const r = validateFlow(
      [
        node('t1', 'trigger', { event_type: 'x' }),
        node('c1', 'condition', {}),
        node('a1', 'give_item'),
      ],
      [edge('e1', 't1', 'c1'), edge('e2', 'c1', 'a1', 'maybe')],
    )
    expect(r.ok).toBe(false)
    expect(rules(r)).toContain('edge.handle')
  })

  it('validates switch case handles against data.cases count', () => {
    // 2 cases → case_0, case_1, default valid; case_2 invalid.
    const sw = node('s1', 'switch', { field: 'f', cases: [{ value: 'a' }, { value: 'b' }] })
    const base = [node('t1', 'trigger', { event_type: 'x' }), sw, node('a1', 'give_item')]
    const good = validateFlow(base, [edge('e1', 't1', 's1'), edge('e2', 's1', 'a1', 'case_1')])
    expect(good.ok).toBe(true)
    const bad = validateFlow(base, [edge('e1', 't1', 's1'), edge('e2', 's1', 'a1', 'case_2')])
    expect(bad.ok).toBe(false)
    expect(rules(bad)).toContain('edge.handle')
  })

  it('detects a cycle', () => {
    const r = validateFlow(
      [
        node('t1', 'trigger', { event_type: 'x' }),
        node('a1', 'give_item'),
        node('a2', 'heal'),
      ],
      [edge('e1', 't1', 'a1'), edge('e2', 'a1', 'a2'), edge('e3', 'a2', 'a1')], // a1→a2→a1
    )
    expect(r.ok).toBe(false)
    expect(rules(r)).toContain('flow.cycle')
  })

  it('errors on a ui_builder with an empty tree', () => {
    const r = validateFlow(
      [node('t1', 'trigger', { event_type: 'x' }), node('u1', 'ui_builder', {})],
      [edge('e1', 't1', 'u1')],
    )
    expect(r.ok).toBe(false)
    expect(rules(r)).toContain('ui_builder.tree')
  })

  it('accepts a ui_builder with a real tree', () => {
    const r = validateFlow(
      [node('t1', 'trigger', { event_type: 'x' }),
       node('u1', 'ui_builder', { tree: { type: 'panel', children: [{ type: 'text', text: 'hi' }] } })],
      [edge('e1', 't1', 'u1')],
    )
    expect(rules(r)).not.toContain('ui_builder.tree')
  })

  it('warns on an unreachable node (no error)', () => {
    const f = validFlow()
    f.nodes.push(node('orphan', 'heal'))
    const r = validateFlow(f.nodes, f.edges)
    expect(r.ok).toBe(true) // warning only
    expect(rules(r)).toContain('node.unreachable')
  })
})
