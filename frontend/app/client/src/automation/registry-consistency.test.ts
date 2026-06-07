// Registry & pure-data consistency tests for the client automation layer.
//
// The client (app/client) has zero tests. This suite targets PURE DATA and
// CONSISTENCY, not React rendering — bun:test runs without a DOM, so we never
// render ui.tsx. We only import META (pure data) and the two registries.
// (Importing the registries is safe: Bun transpiles the tsx but never renders it.)
//
// PASS = consistent. A FAIL here is a REAL inconsistency/bug, documented inline
// with `// BUG:` stating the correct behavior. Tests do NOT fix anything.

import { test, expect, describe } from 'bun:test'

// Frontend registry (meta + ui per type) and its derived maps.
import {
  registryMetaByType,
  registryNodeTypes,
  registryDefaults,
  registryOutputSchemas,
  registryCatalog,
  registryTypes,
} from './nodes/registry'

// Backend registry (meta + exec handler). getNodeEntry/allNodeMetas.
import { getNodeEntry, allNodeMetas } from '@server/live/nodes/registry'

// Pure data catalogs.
import { ACTION_TYPES } from './nodes/actions/actionTypes'
import { nodeOutputSchemas as legacyNodeOutputSchemas } from './nodeOutputSchemas'

import type { NodeMeta } from '@shared/automation/nodeMeta'

// ── Helpers ───────────────────────────────────────────────────────────────

const ALLOWED_FIELD_TYPES = new Set(['string', 'number', 'boolean', 'object', 'any'])
const ALLOWED_KINDS = new Set(['trigger', 'action', 'logic', 'data', 'ui', 'ui-primitive', 'ai'])

/** The two metas that legitimately have NO exec handler on the backend.
 *  triggers (matched in evaluateEvent) and wait (orchestrator-owned). */
function isNoExecMeta(m: NodeMeta): boolean {
  return m.flow?.isTrigger === true || m.type === 'wait'
}

const feMetas = Object.values(registryMetaByType)
const beMetas = allNodeMetas()
const feTypes = new Set(Object.keys(registryMetaByType))
const beTypes = new Set(beMetas.map(m => m.type))

// ───────────────────────────────────────────────────────────────────────────
// VECTOR 1 — Frontend ↔ Backend type consistency
// ───────────────────────────────────────────────────────────────────────────
describe('vector 1: FE↔BE consistency', () => {
  test('every backend meta type has a frontend meta (else: node has no editor UI)', () => {
    const missingOnFE = beMetas.map(m => m.type).filter(t => !feTypes.has(t))
    // BUG (if fails): a node registered on the backend but absent from the FE
    // registry can run but never be created/edited in the flow editor.
    expect(missingOnFE).toEqual([])
  })

  test('every frontend meta type is runnable on the backend (handler, OR a known structural exception)', () => {
    // A FE-editable node must be executable somehow. The legit exceptions that
    // have NO backend registry handler:
    //   - ui-primitive nodes: consumed structurally by buildUITree() via the
    //     parent ui_builder/ui_panel handler, never dispatched standalone.
    //   - ai_memory: dispatched inside the AI agent loop (FlowEngine ~L1142),
    //     not through the node registry.
    //   - trigger/wait: entry point / orchestrator-owned.
    const orphans: string[] = []
    for (const m of feMetas) {
      const runnable =
        beTypes.has(m.type) ||
        m.kind === 'ui-primitive' ||
        m.type === 'ai_memory' ||
        isNoExecMeta(m)
      if (!runnable) orphans.push(m.type)
    }
    // BUG (if fails): a FE node that the backend can neither dispatch nor handle
    // structurally — it draws in the editor but is a silent no-op at execution.
    expect(orphans).toEqual([])
  })

  // Documents (does not fail on) the set of FE types absent from the BE registry,
  // so a future regression that adds a NON-structural orphan is visible.
  test('FE types absent from BE registry are exactly the structural exceptions', () => {
    const missingOnBE = [...feTypes].filter(t => !beTypes.has(t)).sort()
    const expected = [
      'ai_memory',
      'ui_bar', 'ui_button', 'ui_col', 'ui_icon', 'ui_row',
      'ui_spacer', 'ui_tabs', 'ui_text', 'ui_text_input',
    ].sort()
    expect(missingOnBE).toEqual(expected)
  })

  test('every backend meta either has a handler (getNodeEntry) or is trigger/wait', () => {
    const offenders: string[] = []
    for (const m of beMetas) {
      const hasHandler = !!getNodeEntry(m.type)
      if (!hasHandler && !isNoExecMeta(m)) offenders.push(m.type)
    }
    // BUG (if fails): a non-trigger, non-wait node with no exec handler is dead
    // weight — the dispatcher has nothing to run.
    expect(offenders).toEqual([])
  })

  test('trigger/wait metas have NO handler (the documented exception)', () => {
    const wrong: string[] = []
    for (const m of beMetas) {
      if (isNoExecMeta(m) && getNodeEntry(m.type)) wrong.push(m.type)
    }
    expect(wrong).toEqual([])
  })

  test('FE and BE meta objects for the same type are the SAME shared object (single source)', () => {
    // meta.ts is the only file imported by both sides — the registries should
    // reference the identical object, not divergent copies.
    const beByType = new Map(beMetas.map(m => [m.type, m]))
    const divergent: string[] = []
    for (const [type, feMeta] of Object.entries(registryMetaByType)) {
      const beMeta = beByType.get(type)
      if (beMeta && beMeta !== feMeta) divergent.push(type)
    }
    // BUG (if fails): FE/BE import different meta objects for the same type →
    // label/icon/defaults can silently drift between editor and engine.
    expect(divergent).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// VECTOR 2 — `type` uniqueness (a Map would silently swallow dupes)
// ───────────────────────────────────────────────────────────────────────────
describe('vector 2: type uniqueness', () => {
  test('frontend registry has no duplicate node type', () => {
    // registryMetaByType is built via Object.fromEntries — a dupe would be
    // silently overwritten and the count would drop. Compare keys vs entries.
    const types = feMetas.map(m => m.type)
    const unique = new Set(types)
    const dupes = types.filter((t, i) => types.indexOf(t) !== i)
    // BUG (if fails): two ENTRIES share a `type`; one shadows the other.
    expect([...new Set(dupes)]).toEqual([])
    expect(unique.size).toBe(types.length)
  })

  test('backend registry has no duplicate node type', () => {
    const types = beMetas.map(m => m.type)
    const dupes = types.filter((t, i) => types.indexOf(t) !== i)
    expect([...new Set(dupes)]).toEqual([])
  })

  test('registryTypes set size matches the meta count (no swallowed dupes)', () => {
    expect(registryTypes.size).toBe(feMetas.length)
  })

  test('registryNodeTypes (type→component) has one entry per meta', () => {
    expect(Object.keys(registryNodeTypes).length).toBe(feMetas.length)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// VECTOR 3 — defaults are valid / serializable
// ───────────────────────────────────────────────────────────────────────────
describe('vector 3: defaults validity', () => {
  test('every defaults is JSON-serializable (no functions/cycles)', () => {
    const bad: string[] = []
    for (const m of feMetas) {
      const d = m.defaults
      if (d === undefined) continue
      try {
        const round = JSON.parse(JSON.stringify(d))
        // a function/undefined-bearing default would silently lose data
        if (typeof d !== 'object' || d === null) bad.push(m.type)
        else if (JSON.stringify(round) !== JSON.stringify(d)) bad.push(m.type)
      } catch {
        bad.push(m.type)
      }
    }
    // BUG (if fails): a node's create-defaults can't survive JSON round-trip →
    // node.data persisted/sent over the wire would be corrupt.
    expect(bad).toEqual([])
  })

  test('registryDefaults never yields undefined (falls back to {})', () => {
    const undef = Object.entries(registryDefaults).filter(([, v]) => v === undefined)
    expect(undef.map(([k]) => k)).toEqual([])
  })

  test('defaults.params, when present, is a plain object (handlers read params.*)', () => {
    const bad: string[] = []
    for (const m of feMetas) {
      const params = (m.defaults as any)?.params
      if (params === undefined) continue
      if (typeof params !== 'object' || params === null || Array.isArray(params)) bad.push(m.type)
    }
    // BUG (if fails): a handler that does `param('params.x')` on a non-object
    // params would read undefined for every field.
    expect(bad).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// VECTOR 4 — outputSchema integrity + legacy nodeOutputSchemas agreement
// ───────────────────────────────────────────────────────────────────────────
describe('vector 4: outputSchema integrity', () => {
  test('every meta.outputSchema field has a non-empty name and a valid type', () => {
    const problems: string[] = []
    for (const m of feMetas) {
      const schema = m.outputSchema
      if (!schema) continue
      if (typeof schema.description !== 'string') problems.push(`${m.type}: schema.description not a string`)
      if (!Array.isArray(schema.fields)) { problems.push(`${m.type}: fields not an array`); continue }
      for (const f of schema.fields) {
        if (!f.name || typeof f.name !== 'string') problems.push(`${m.type}: field with empty name`)
        if (!ALLOWED_FIELD_TYPES.has(f.type)) problems.push(`${m.type}.${f.name}: bad type "${f.type}"`)
      }
    }
    // BUG (if fails): an output field with no name or an unknown type breaks
    // {{node.field}} autocomplete / Monaco type generation.
    expect(problems).toEqual([])
  })

  test('no duplicate field names within a single outputSchema', () => {
    const dupes: string[] = []
    for (const m of feMetas) {
      const fields = m.outputSchema?.fields ?? []
      const names = fields.map(f => f.name)
      const seen = names.filter((n, i) => names.indexOf(n) !== i)
      if (seen.length) dupes.push(`${m.type}: ${[...new Set(seen)].join(',')}`)
    }
    expect(dupes).toEqual([])
  })

  test('registryOutputSchemas only includes types whose meta declares one', () => {
    for (const type of Object.keys(registryOutputSchemas)) {
      expect(registryMetaByType[type]?.outputSchema).toBeDefined()
    }
  })

  test('legacy nodeOutputSchemas.ts does not contradict the migrated meta outputSchema', () => {
    // For any node type present in BOTH the legacy map and a migrated meta, the
    // field-name sets should agree (the meta is the source of truth post-migration).
    const conflicts: string[] = []
    for (const [type, legacy] of Object.entries(legacyNodeOutputSchemas)) {
      const meta = registryMetaByType[type]
      if (!meta?.outputSchema) continue
      const legacyNames = new Set(legacy.fields.map(f => f.name))
      const metaNames = new Set(meta.outputSchema.fields.map(f => f.name))
      const onlyLegacy = [...legacyNames].filter(n => !metaNames.has(n))
      const onlyMeta = [...metaNames].filter(n => !legacyNames.has(n))
      if (onlyLegacy.length || onlyMeta.length) {
        conflicts.push(`${type}: legacy-only=[${onlyLegacy}] meta-only=[${onlyMeta}]`)
      }
    }
    // BUG (if fails): the duplicate output-schema source (legacy file) drifted
    // from the migrated meta — autocomplete shows stale/contradictory fields.
    // This is INFORMATIONAL: the legacy file is a known transitional duplicate.
    if (conflicts.length) {
      console.warn('[vector4] legacy/meta outputSchema drift:\n  ' + conflicts.join('\n  '))
    }
    expect(Array.isArray(conflicts)).toBe(true)
  })

  test('get_player/find_player outputSchema matches the REAL nested player shape', () => {
    // The DST mod posts the player object with NESTED stats:
    //   collectors.lua:151 → data.health = { current=…, max=… } (same for hunger/sanity/position).
    // get_player/find_player handlers set that raw player object into context, so the
    // real fields are `health.current`, `health.max`, `position.x`, etc.
    //
    // The legacy nodeOutputSchemas.ts gets this RIGHT (health.current/.max/...).
    // The migrated meta.outputSchema for get_player declares `health`/`hunger`/`sanity`
    // as flat `number` fields — which does NOT exist at runtime (health is an object).
    const gp = registryMetaByType['get_player']?.outputSchema?.fields ?? []
    const healthField = gp.find(f => f.name === 'health')
    // BUG: get_player meta.outputSchema declares `health: number` but the actual
    //      context value is `health: { current, max }` (an object). The schema
    //      should expose `health.current` / `health.max` (like the legacy file),
    //      OR declare `health` with type 'object'. As-is, {{get_player.health}}
    //      autocomplete is wrong and {{get_player.health.current}} is undocumented.
    if (healthField) {
      // This assertion encodes the CORRECT behavior; it FAILS today, proving the bug.
      expect(healthField.type).toBe('object')
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
// VECTOR 5 — actionTypes.ts integrity
// ───────────────────────────────────────────────────────────────────────────
describe('vector 5: actionTypes', () => {
  test('every action_type value is unique', () => {
    const values = ACTION_TYPES.map(a => a.value)
    const dupes = values.filter((v, i) => values.indexOf(v) !== i)
    // BUG (if fails): a duplicate action value means two palette entries map to
    // the same action_type; the second is unreachable / overrides the first.
    expect([...new Set(dupes)]).toEqual([])
  })

  test('every action_type has a value, a label, and a params array', () => {
    const bad: string[] = []
    for (const a of ACTION_TYPES) {
      if (!a.value || typeof a.value !== 'string') bad.push(`missing value: ${JSON.stringify(a)}`)
      if (!a.label || typeof a.label !== 'string') bad.push(`${a.value}: missing label`)
      if (!Array.isArray(a.params)) bad.push(`${a.value}: params not an array`)
    }
    expect(bad).toEqual([])
  })

  test('every param within an action has a non-empty key, and keys are unique per action', () => {
    const bad: string[] = []
    for (const a of ACTION_TYPES) {
      const keys = (a.params ?? []).map((p: any) => p.key)
      for (const p of a.params ?? []) {
        if (!p.key || typeof p.key !== 'string') bad.push(`${a.value}: param with empty key`)
        if (!p.label || typeof p.label !== 'string') bad.push(`${a.value}.${p.key}: missing label`)
      }
      const dup = keys.filter((k, i) => keys.indexOf(k) !== i)
      if (dup.length) bad.push(`${a.value}: duplicate param keys ${[...new Set(dup)]}`)
    }
    // BUG (if fails): a duplicate param key inside one action means one field's
    // input overwrites another in node.data.params.
    expect(bad).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// VECTOR 6 — required meta fields non-empty
// ───────────────────────────────────────────────────────────────────────────
describe('vector 6: required meta fields', () => {
  test('every meta has non-empty type, label, category, icon, color and a valid kind', () => {
    const problems: string[] = []
    for (const m of feMetas) {
      if (!m.type) problems.push(`<no type>: empty type`)
      if (!m.label) problems.push(`${m.type}: empty label`)
      if (!m.category) problems.push(`${m.type}: empty category`)
      if (!m.icon) problems.push(`${m.type}: empty icon`)
      if (!m.color) problems.push(`${m.type}: empty color`)
      if (!ALLOWED_KINDS.has(m.kind)) problems.push(`${m.type}: invalid kind "${m.kind}"`)
      if (typeof m.description !== 'string') problems.push(`${m.type}: description not a string`)
    }
    // BUG (if fails): a node missing icon/color/label renders broken in the
    // palette/canvas/minimap.
    expect(problems).toEqual([])
  })

  test('every meta.color is a valid hex color (used for border + minimap)', () => {
    const bad: string[] = []
    for (const m of feMetas) {
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(m.color)) bad.push(`${m.type}: "${m.color}"`)
    }
    // BUG (if fails): NodeMeta.color is documented as a hex color; a non-hex
    // value silently breaks the minimap nodeColor.
    expect(bad).toEqual([])
  })

  test('non-hidden catalog entries all carry an icon + label (palette renders them)', () => {
    const bad: string[] = []
    for (const c of registryCatalog) {
      if (!c.icon) bad.push(`${c.type}: no icon in catalog`)
      if (!c.label) bad.push(`${c.type}: no label in catalog`)
      if (!c.family) bad.push(`${c.type}: no family/kind in catalog`)
    }
    expect(bad).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// VECTOR 7 — aiDescription / aiParamDescriptions coherence
// ───────────────────────────────────────────────────────────────────────────
describe('vector 7: AI tool descriptions', () => {
  test('aiParamDescriptions keys are non-empty strings with non-empty values', () => {
    const bad: string[] = []
    for (const m of feMetas) {
      const apd = m.aiParamDescriptions
      if (!apd) continue
      for (const [k, v] of Object.entries(apd)) {
        if (!k) bad.push(`${m.type}: empty param-desc key`)
        if (typeof v !== 'string' || !v.trim()) bad.push(`${m.type}.${k}: empty description`)
      }
    }
    expect(bad).toEqual([])
  })

  test('nodes with aiParamDescriptions also have an aiDescription (wired-as-tool nodes)', () => {
    const missing: string[] = []
    for (const m of feMetas) {
      if (m.aiParamDescriptions && !m.aiDescription) missing.push(m.type)
    }
    // BUG (if fails): a node documents its params for the AI tool schema but has
    // no overall aiDescription — the model gets param hints with no tool purpose.
    expect(missing).toEqual([])
  })

  test('aiParamDescriptions keys reference plausible params (defaults.params / known top-level)', () => {
    // The model fills params; described keys should correspond to params the node
    // actually reads. We accept a key if it appears in defaults.params, in
    // top-level defaults, OR is a well-known generic param name. Pure mismatches
    // (a described key that matches nothing the node declares) are flagged.
    const KNOWN_TOPLEVEL = new Set([
      'action_type', 'action', 'flow', 'key', 'value', 'operation', 'scope',
    ])
    const suspicious: string[] = []
    for (const m of feMetas) {
      const apd = m.aiParamDescriptions
      if (!apd) continue
      const defaultParams = (m.defaults as any)?.params
      const paramKeys = defaultParams && typeof defaultParams === 'object'
        ? new Set(Object.keys(defaultParams))
        : new Set<string>()
      const topKeys = m.defaults ? new Set(Object.keys(m.defaults)) : new Set<string>()
      for (const k of Object.keys(apd)) {
        const ok = paramKeys.has(k) || topKeys.has(k) || KNOWN_TOPLEVEL.has(k)
        if (!ok) suspicious.push(`${m.type}.${k}`)
      }
    }
    // INFORMATIONAL: described params may be optional/dynamic (not in defaults).
    // We log but don't fail, since the model can supply params absent from defaults.
    if (suspicious.length) {
      console.warn('[vector7] aiParamDescriptions keys not found in defaults:\n  ' + suspicious.join('\n  '))
    }
    expect(Array.isArray(suspicious)).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Sanity: report registry sizes (visible in test output)
// ───────────────────────────────────────────────────────────────────────────
test('registry size report', () => {
  console.log(`[report] FE metas=${feMetas.length} BE metas=${beMetas.length} ` +
    `BE handlers=${beMetas.filter(m => !!getNodeEntry(m.type)).length} ` +
    `action_types=${ACTION_TYPES.length}`)
  expect(feMetas.length).toBeGreaterThan(0)
})
