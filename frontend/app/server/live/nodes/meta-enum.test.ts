// Drift guard: a node's aiEnums (what the AI generator is told are valid values) must
// match the RUNTIME source of truth. We duplicated the value lists into meta for the
// prompt; this test fails if they drift from where the engine actually checks them.
// Same mutation-checked pattern as output-handles.test.ts.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { allNodeMetas } from './registry'

const metas = new Map(allNodeMetas().map((m) => [m.type, m]))
// import.meta.dir = .../frontend/app/server/live/nodes → up 4 to frontend/
const read = (rel: string) => readFileSync(join(import.meta.dir, '..', '..', '..', '..', rel), 'utf8')

describe('aiEnums match the runtime source', () => {
  it('condition/filter/loop operators == the operators evaluateCondition handles', () => {
    // expressions.ts is where evaluateCondition switches on the operator.
    const src = read('app/server/live/expressions.ts')
    const runtimeOps = new Set(
      (src.match(/case '([a-z_]+)':/g) ?? [])
        .map((s) => s.replace(/case '|':/g, ''))
        .filter((op) => /^(equals|not_equals|greater_than|less_than|contains|not_contains|starts_with|not_starts_with|ends_with|exists)$/.test(op)),
    )
    expect(runtimeOps.size).toBeGreaterThanOrEqual(10)
    for (const type of ['condition', 'filter', 'loop']) {
      const ops = metas.get(type)?.aiEnums?.operator ?? []
      expect(ops.length, `${type} should declare operators`).toBeGreaterThan(0)
      for (const op of ops) {
        expect(runtimeOps.has(op), `${type} aiEnums operator "${op}" must be handled at runtime`).toBe(true)
      }
    }
  })

  it('every aiEnums value list is non-empty and de-duplicated', () => {
    for (const m of metas.values()) {
      if (!m.aiEnums) continue
      for (const [key, vals] of Object.entries(m.aiEnums)) {
        expect(vals.length, `${m.type}.${key} should not be empty`).toBeGreaterThan(0)
        expect(new Set(vals).size, `${m.type}.${key} has duplicates`).toBe(vals.length)
      }
    }
  })

  it('player_state attributes are a subset of what the ui exposes', () => {
    const ui = read('app/shared/automation/nodes/data/player/player_state/ui.tsx')
    const uiVals = new Set((ui.match(/value: '([a-z_]+)'/g) ?? []).map((s) => s.replace(/value: '|'/g, '')))
    const attrs = metas.get('player_state')?.aiEnums?.attribute ?? []
    expect(attrs.length).toBeGreaterThan(0)
    for (const a of attrs) expect(uiVals.has(a), `player_state attribute "${a}" must exist in the ui`).toBe(true)
  })

  it('aiConfigExample, when present, is a plain object', () => {
    for (const m of metas.values()) {
      if (m.aiConfigExample == null) continue
      expect(typeof m.aiConfigExample, `${m.type}.aiConfigExample`).toBe('object')
      expect(Array.isArray(m.aiConfigExample)).toBe(false)
    }
  })
})
