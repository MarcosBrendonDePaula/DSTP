// Consistency guard: a branching node's declared meta.outputHandles MUST match the
// handles its exec.ts actually follows. The AI flow generator reads outputHandles to
// know how to wire edges; if a meta drifts from its handler, the AI would emit edges
// the engine silently ignores. This test pins the pair together.
//
// The expected sets below are transcribed from each exec.ts (the source of truth):
//   condition/exec.ts  → 'true' | 'false'
//   switch/exec.ts     → 'case_<i>' (dynamic) | 'default'
//   foreach/exec.ts    → 'each' | 'done'
//   loop/exec.ts       → 'body' | 'done'
//   try_catch/exec.ts  → 'try' | 'catch'
// Mutation-check: change a meta's handle id and this test goes red.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { allNodeMetas } from './registry'

const EXPECTED: Record<string, string[]> = {
  condition: ['true', 'false'],
  switch: ['case_<i>', 'default'],
  foreach: ['each', 'done'],
  loop: ['body', 'done'],
  try_catch: ['try', 'catch'],
}

const metas = new Map(allNodeMetas().map(m => [m.type, m]))

describe('node outputHandles match their exec.ts', () => {
  for (const [type, expected] of Object.entries(EXPECTED)) {
    it(`${type} declares exactly its real handles`, () => {
      const meta = metas.get(type)
      expect(meta, `meta for ${type} should exist`).toBeDefined()
      const ids = (meta!.outputHandles ?? []).map(h => h.id)
      expect(ids.sort()).toEqual([...expected].sort())
    })
  }

  it("switch's case handle is marked dynamic (one per data.cases entry)", () => {
    const sw = metas.get('switch')!
    const caseHandle = (sw.outputHandles ?? []).find(h => h.id === 'case_<i>')
    expect(caseHandle?.dynamic).toBe(true)
  })

  it('a plain action node has NO outputHandles (single default edge)', () => {
    // give_item is a sequential action — its exec returns 'continue', no branching.
    const give = metas.get('give_item')
    expect(give).toBeDefined()
    expect(give!.outputHandles).toBeUndefined()
  })
})
