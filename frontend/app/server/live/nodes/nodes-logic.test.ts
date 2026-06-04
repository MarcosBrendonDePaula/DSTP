// Unit tests for the logic-category node handlers (branch/loop/timing).
import { describe, it, expect } from 'bun:test'
import { makeRc } from './testkit'
import type { FlowEdge } from '../../db'

import { handler as condition } from '../../../shared/automation/nodes/logic/branch/condition/exec'
import { handler as switchNode } from '../../../shared/automation/nodes/logic/branch/switch/exec'
import { handler as filter } from '../../../shared/automation/nodes/logic/branch/filter/exec'
import { handler as foreach } from '../../../shared/automation/nodes/logic/loop/foreach/exec'
import { handler as delay } from '../../../shared/automation/nodes/logic/timing/delay/exec'

const edge = (sourceHandle?: string): FlowEdge => ({ id: 'e', source: 'a', target: 'b', sourceHandle } as any)

describe('condition node', () => {
  it('true → follows the true edge, not the false', async () => {
    const s = makeRc({ data: { field: '{{x}}', operator: 'equals', value: '5' }, context: { x: 5 } })
    const r: any = await condition(s.rc)
    expect(s.out().result).toBe(true)
    expect(r.followEdges(edge('true'))).toBe(true)
    expect(r.followEdges(edge('false'))).toBe(false)
  })
  it('false → follows the false edge', async () => {
    const s = makeRc({ data: { field: '{{x}}', operator: 'equals', value: '9' }, context: { x: 5 } })
    const r: any = await condition(s.rc)
    expect(s.out().result).toBe(false)
    expect(r.followEdges(edge('false'))).toBe(true)
    expect(r.followEdges(edge('true'))).toBe(false)
  })
  it('starts_with operator', async () => {
    const s = makeRc({ data: { field: '{{m}}', operator: 'starts_with', value: '!buy' }, context: { m: '!buy spear' } })
    const r: any = await condition(s.rc)
    expect(r.followEdges(edge('true'))).toBe(true)
  })
})

describe('switch node', () => {
  it('routes to the matching case handle', async () => {
    const s = makeRc({ data: { field: '{{s}}', cases: [{ value: 'winter' }, { value: 'summer' }] }, context: { s: 'summer' } })
    const r: any = await switchNode(s.rc)
    expect(s.out().matched).toBe('case_1')
    expect(r.followEdges(edge('case_1'))).toBe(true)
    expect(r.followEdges(edge('case_0'))).toBe(false)
  })
  it('falls through to default when no case matches', async () => {
    const s = makeRc({ data: { field: '{{s}}', cases: [{ value: 'a' }] }, context: { s: 'zzz' } })
    const r: any = await switchNode(s.rc)
    expect(s.out().matched).toBe('default')
    expect(r.followEdges(edge('default'))).toBe(true)
  })
})

describe('filter node', () => {
  it('continues when the condition passes, stops otherwise', async () => {
    let s = makeRc({ data: { field: '{{x}}', operator: 'greater_than', value: '3' }, context: { x: 5 } })
    expect(await filter(s.rc)).toBe('continue'); expect(s.out().passed).toBe(true)
    s = makeRc({ data: { field: '{{x}}', operator: 'greater_than', value: '9' }, context: { x: 5 } })
    expect(await filter(s.rc)).toBe('stop'); expect(s.out().passed).toBe(false)
  })
})

describe('foreach node', () => {
  it('runs the each branch per item then follows done', async () => {
    const seen: any[] = []
    const s = makeRc({
      data: { params: { list: '{{items}}' } },
      context: { items: ['a', 'b', 'c'] },
      overrides: { followOutEdges: async () => { seen.push(/* loop set on context */ undefined); return null } },
    })
    // capture loop.item across iterations
    const items: any[] = []
    s.rc.followOutEdges = async () => { items.push(s.rc.context.loop?.item); return null }
    const r: any = await foreach(s.rc)
    expect(items).toEqual(['a', 'b', 'c'])
    expect(s.out().count).toBe(3)
    expect(r.followEdges(edge('done'))).toBe(true)
  })
  it('caps at 40 items and flags truncated', async () => {
    const big = Array.from({ length: 50 }, (_, i) => i)
    const s = makeRc({ data: { params: { list: '{{items}}' } }, context: { items: big } })
    s.rc.followOutEdges = async () => null
    await foreach(s.rc)
    expect(s.out().count).toBe(40)
    expect(s.out().truncated).toBe(true)
  })
})

describe('delay node', () => {
  it('clamps to >= 0 and resolves the template', async () => {
    const s = makeRc({ data: { params: { delay_ms: '0' } } })
    const r = await delay(s.rc)
    expect(r).toBe('continue')
    expect(s.out().ms).toBe(0)
  })
})
