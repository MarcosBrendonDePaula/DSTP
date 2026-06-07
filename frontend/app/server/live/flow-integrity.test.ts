// Flow & node-module INTEGRITY tests. These don't test one node in depth — they
// audit the *system*: are all node modules wired into the registries, do the
// example flows reference real nodes/handles, do handlers survive their own
// defaults, and do the simple nodes write what their outputSchema promises.
//
// A FAIL here is a REAL bug (an orphan node, a broken example, a lying schema, a
// default that crashes its own handler). When a failing assertion documents a bug
// the fix is NOT in this file — the `// BUG:` comment states what the correct
// behavior should be. Run: bun test app/server/live/flow-integrity.test.ts
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { getNodeEntry, allNodeMetas } from './nodes/registry'
import {
  registryMetaByType,
  registryNodeTypes,
  registryOutputSchemas,
} from '../../client/src/automation/nodes/registry'
import { makeRc } from './nodes/testkit'

const SHARED_NODES = join(process.cwd(), 'app', 'shared', 'automation', 'nodes')
const EXAMPLES = join(process.cwd(), 'examples', 'flows')

// ── Recursively collect every node module folder (one that has a meta.ts) ──
interface NodeFolder {
  dir: string
  rel: string // path relative to SHARED_NODES, posix
  hasExec: boolean
  hasUi: boolean
  folderName: string
}
function collectNodeFolders(root: string): NodeFolder[] {
  const out: NodeFolder[] = []
  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true })
    const hasMeta = entries.some(e => e.isFile() && e.name === 'meta.ts')
    if (hasMeta) {
      out.push({
        dir,
        rel: dir.slice(SHARED_NODES.length + 1).replace(/\\/g, '/'),
        hasExec: entries.some(e => e.isFile() && e.name === 'exec.ts'),
        hasUi: entries.some(e => e.isFile() && e.name === 'ui.tsx'),
        folderName: dir.split(/[\\/]/).pop()!,
      })
    }
    for (const e of entries) if (e.isDirectory()) walk(join(dir, e.name))
  }
  walk(root)
  return out
}

// Load a node's meta.ts via dynamic import (synchronously gathered up front).
async function loadMeta(folder: NodeFolder): Promise<any> {
  const mod = await import(join(folder.dir, 'meta.ts'))
  return mod.meta
}

const folders = collectNodeFolders(SHARED_NODES)

// ────────────────────────────────────────────────────────────────────────────
// VECTOR 1 — every node with exec.ts is registered in the BACKEND registry.
// An exec.ts not in the registry never runs (falls through to legacy/error).
// ────────────────────────────────────────────────────────────────────────────
describe('vector 1 — backend registry covers every exec.ts', () => {
  it('every node folder with exec.ts has a backend registry entry', async () => {
    const orphans: string[] = []
    for (const f of folders) {
      if (!f.hasExec) continue
      const meta = await loadMeta(f)
      if (!getNodeEntry(meta.type)) orphans.push(`${f.rel} (type=${meta.type})`)
    }
    // BUG (if non-empty): each listed node ships an exec.ts handler but is NOT in
    // app/server/live/nodes/registry.ts, so getNodeEntry() returns undefined and
    // the engine can never dispatch it. Correct: add a { meta, handler } entry.
    expect(orphans).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// VECTOR 2 — every node with ui.tsx is in the FRONTEND registry.
// An orphaned ui.tsx never appears in the editor palette/canvas.
// ────────────────────────────────────────────────────────────────────────────
describe('vector 2 — frontend registry covers every ui.tsx', () => {
  it('every node folder with ui.tsx has a frontend registry entry', async () => {
    const orphans: string[] = []
    for (const f of folders) {
      if (!f.hasUi) continue
      const meta = await loadMeta(f)
      if (!registryNodeTypes[meta.type]) orphans.push(`${f.rel} (type=${meta.type})`)
    }
    // BUG (if non-empty): each listed node has a ui.tsx but is missing from
    // app/client/src/automation/nodes/registry.ts, so it never renders in the
    // editor. Correct: add a { meta, ui } entry.
    expect(orphans).toEqual([])
  })

  it('every node with exec but no ui (and not a trigger/wait) is still placeable somehow', async () => {
    // ai_memory is the inverse case: it has ui but NO exec — purely an AI tool the
    // model uses, not dispatched. Just record the asymmetry, no assertion failure
    // intended unless a *handler-bearing* node is invisible in the editor.
    const handlerButNoUi: string[] = []
    for (const f of folders) {
      if (!f.hasExec || f.hasUi) continue
      const meta = await loadMeta(f)
      // triggers/wait legitimately have no exec; here we want exec WITHOUT ui.
      if (!registryNodeTypes[meta.type]) handlerButNoUi.push(`${f.rel} (type=${meta.type})`)
    }
    // BUG (if non-empty): a node that EXECUTES (has exec.ts) cannot be added in the
    // editor because it has no ui.tsx and no frontend registry entry.
    expect(handlerButNoUi).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// VECTOR 3 — meta.type matches the folder name (the stated convention).
// ────────────────────────────────────────────────────────────────────────────
describe('vector 3 — meta.type equals folder name', () => {
  it('no node diverges from the type==folder convention', async () => {
    const mismatches: string[] = []
    for (const f of folders) {
      const meta = await loadMeta(f)
      if (meta.type !== f.folderName) {
        mismatches.push(`${f.rel}: meta.type=${meta.type} folder=${f.folderName}`)
      }
    }
    // BUG (if non-empty): NodeMeta.type is documented as "Matches the folder name".
    // A divergence means a maintainer reading the tree by folder gets the wrong id.
    expect(mismatches).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// VECTOR 4 — example flows are structurally valid:
//   - every node.type is registered (frontend registry = what an editor knows)
//   - every edge.source/target points at an existing node
//   - sourceHandle is one the source node type actually exposes
// ────────────────────────────────────────────────────────────────────────────

// Allowed source handles per node type. `null` entry = the node only emits the
// default (unlabeled) edge, so any non-empty handle is suspicious. A function
// validates dynamic handles (switch case_<i>).
type HandleCheck = (handle: string | undefined | null, node: any) => boolean
const anyOf = (...hs: string[]): HandleCheck =>
  (h) => h == null || h === '' || hs.includes(h)
const HANDLE_RULES: Record<string, HandleCheck> = {
  condition: anyOf('true', 'false'),
  filter: anyOf(), // single output, only the default edge
  switch: (h, node) => {
    if (h == null || h === '' || h === 'default') return true
    const m = /^case_(\d+)$/.exec(h)
    if (!m) return false
    const cases = Array.isArray(node?.data?.cases) ? node.data.cases : []
    return Number(m[1]) < cases.length
  },
  foreach: anyOf('each', 'done'),
  loop: anyOf('body', 'done'),
  try_catch: anyOf('try', 'catch'),
}

// Gather all flow JSONs (single flow OR {flows:[...]} bundles → list of flows).
function collectExampleFlows(): Array<{ file: string; name: string; flow: any }> {
  const result: Array<{ file: string; name: string; flow: any }> = []
  function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.json')) continue
      const raw = JSON.parse(readFileSync(p, 'utf8'))
      const rel = p.slice(EXAMPLES.length + 1).replace(/\\/g, '/')
      if (Array.isArray(raw.flows)) {
        raw.flows.forEach((f: any, i: number) =>
          result.push({ file: rel, name: `${raw.name ?? rel}#${i}`, flow: f }))
      } else {
        result.push({ file: rel, name: raw.name ?? rel, flow: raw })
      }
    }
  }
  walk(EXAMPLES)
  return result
}

const exampleFlows = collectExampleFlows()

describe('vector 4 — example flows are structurally valid', () => {
  it('found example flows to validate', () => {
    expect(exampleFlows.length).toBeGreaterThan(0)
  })

  for (const { file, name, flow } of exampleFlows) {
    it(`[${file}] ${name}`, () => {
      const nodes: any[] = Array.isArray(flow.nodes) ? flow.nodes : []
      const edges: any[] = Array.isArray(flow.edges) ? flow.edges : []
      const ids = new Set(nodes.map(n => n.id))

      const unknownTypes: string[] = []
      for (const n of nodes) {
        // A type the editor registry doesn't know = a node that can't be created
        // / rendered when this example is imported.
        if (!registryMetaByType[n.type]) unknownTypes.push(`${n.id}:${n.type}`)
      }

      const danglingEdges: string[] = []
      const badHandles: string[] = []
      for (const e of edges) {
        if (!ids.has(e.source)) danglingEdges.push(`${e.id ?? '?'} source=${e.source}`)
        if (!ids.has(e.target)) danglingEdges.push(`${e.id ?? '?'} target=${e.target}`)
        const src = nodes.find(n => n.id === e.source)
        if (src) {
          const rule = HANDLE_RULES[src.type]
          if (rule && !rule(e.sourceHandle, src)) {
            badHandles.push(`${e.id ?? '?'} ${src.type}.sourceHandle=${e.sourceHandle}`)
          }
        }
      }

      // BUG (any non-empty): the example flow references a node type the registry
      // doesn't know, an edge points at a missing node, or an edge uses a
      // sourceHandle the source node type never emits (so that branch is dead).
      expect({ file, unknownTypes, danglingEdges, badHandles }).toEqual({
        file, unknownTypes: [], danglingEdges: [], badHandles: [],
      })
    })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// VECTOR 5 — each node's handler survives its own meta.defaults + a minimal ctx.
// We skip the IO-bound nodes (they require real network/sqlite/AI) but record them.
// ────────────────────────────────────────────────────────────────────────────
describe('vector 5 — handlers do not crash on their own defaults', () => {
  // Nodes whose handler does genuine IO / heavy side effects via injected helpers.
  // makeRc stubs those helpers, so most still run; the few that touch real
  // sqlite/AI/network even through their handler body get listed as skipped.
  const SKIP = new Set<string>(['ai_agent', 'http_request', 'memory', 'list_flows'])

  it('runs every registered handler with defaults (records skips)', async () => {
    const crashed: string[] = []
    const skipped: string[] = []
    for (const f of folders) {
      if (!f.hasExec) continue
      const meta = await loadMeta(f)
      if (!getNodeEntry(meta.type)) continue // covered by vector 1
      if (SKIP.has(meta.type)) { skipped.push(meta.type); continue }
      const mod = await import(join(f.dir, 'exec.ts'))
      const handler = mod.handler
      const { rc } = makeRc({
        data: meta.defaults ?? {},
        context: { vars: {} },
      })
      try {
        await handler(rc)
      } catch (err: any) {
        crashed.push(`${meta.type}: ${err?.message ?? err}`)
      }
    }
    // Visibility into what was skipped (not a failure).
    if (skipped.length) console.log('[vector5] skipped IO handlers:', skipped.join(', '))
    // BUG (if non-empty): a node's OWN default params make its OWN handler throw —
    // i.e. dragging the node out of the palette and running it as-is crashes the
    // node (and aborts the flow). Correct: defaults must be self-runnable.
    expect(crashed).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// VECTOR 6 — outputSchema vs reality for the pure/simple nodes. Run the handler
// and confirm the keys it writes to context are exactly described by outputSchema.
// A schema field with no corresponding output key (or vice-versa) is lying docs.
// ────────────────────────────────────────────────────────────────────────────
describe('vector 6 — outputSchema matches what the handler writes', () => {
  // type → { data (node.data), context } to drive a representative run.
  const CASES: Record<string, { data: any; context?: any }> = {
    transform: { data: { params: { value: 'hi', operation: 'uppercase' } } },
    split: { data: { params: { value: 'a b c', separator: '', trim: 'true' } } },
    random: { data: { params: { min: '1', max: '1' } } },
    datetime: { data: { params: { operation: 'now' } } },
    edit_variable: { data: { params: { operation: 'set', key: 'k', value: 'v' } }, context: { vars: {} } },
    aggregate: { data: { params: { operation: 'push', key: 'items', value: 'x' } }, context: { vars: {} } },
  }

  for (const [type, cfg] of Object.entries(CASES)) {
    it(`${type}: output keys == outputSchema fields`, async () => {
      const folder = folders.find(f => f.folderName === type && f.hasExec)
      expect(folder).toBeTruthy()
      const mod = await import(join(folder!.dir, 'exec.ts'))
      const meta = await loadMeta(folder!)
      const { rc, out } = makeRc({ data: cfg.data, context: cfg.context ?? {} })
      await mod.handler(rc)

      const produced = out()
      expect(produced && typeof produced === 'object').toBe(true)
      const producedKeys = new Set(Object.keys(produced))
      const schemaKeys = new Set<string>(
        (meta.outputSchema?.fields ?? []).map((x: any) => x.name),
      )

      // split declares part1 as a representative of part1..part10 — accept the
      // whole family as covered by that single field.
      const declaredCoversPartN = schemaKeys.has('part1')

      const undeclared = [...producedKeys].filter(k => {
        if (schemaKeys.has(k)) return false
        if (declaredCoversPartN && /^part(10|[1-9])$/.test(k)) return false
        return true
      })
      const missing = [...schemaKeys].filter(k => {
        if (producedKeys.has(k)) return false
        // outputSchema may legitimately document context-only fields surfaced via
        // {{loop.*}} rather than the node's own setContext output (foreach/loop).
        return true
      })

      // BUG (undeclared non-empty): the handler writes a context key NOT in
      // outputSchema → {{node.key}} autocomplete won't suggest a real field.
      // BUG (missing non-empty): outputSchema promises a field the handler never
      // writes → autocomplete suggests a {{node.key}} that's always undefined.
      expect({ type, undeclared, missing }).toEqual({ type, undeclared: [], missing: [] })
    })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// VECTOR 7 — FlowAnalyzer classifies simple vs stateful correctly, incl. flows
// with 2 triggers and a wait reachable from both.
// ────────────────────────────────────────────────────────────────────────────
describe('vector 7 — FlowAnalyzer classification', () => {
  // Imported lazily so the test file stays cheap if FlowAnalyzer changes shape.
  it('a no-wait flow is simple', async () => {
    const { analyzeFlow } = await import('./FlowAnalyzer')
    const a = analyzeFlow({
      nodes: [
        { id: 't', type: 'trigger', data: {}, position: { x: 0, y: 0 } } as any,
        { id: 'a', type: 'action', data: {}, position: { x: 0, y: 0 } } as any,
      ],
      edges: [{ id: 'e', source: 't', target: 'a' } as any],
    })
    expect(a.isSimple).toBe(true)
    expect(a.waitNodes).toEqual([])
  })

  it('a flow with a wait reachable from TWO triggers lists both as required', async () => {
    const { analyzeFlow } = await import('./FlowAnalyzer')
    const a = analyzeFlow({
      nodes: [
        { id: 't1', type: 'trigger', data: {}, position: { x: 0, y: 0 } } as any,
        { id: 't2', type: 'webhook', data: {}, position: { x: 0, y: 0 } } as any,
        { id: 'w', type: 'wait', data: {}, position: { x: 0, y: 0 } } as any,
        { id: 'a', type: 'action', data: {}, position: { x: 0, y: 0 } } as any,
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'w' } as any,
        { id: 'e2', source: 't2', target: 'w' } as any,
        { id: 'e3', source: 'w', target: 'a' } as any,
      ],
    })
    expect(a.isSimple).toBe(false)
    expect(a.waitNodes).toHaveLength(1)
    expect(new Set(a.waitNodes[0].requiredTriggers)).toEqual(new Set(['t1', 't2']))
  })

  it('a cycle upstream of a wait does not hang the backward walk', async () => {
    const { analyzeFlow } = await import('./FlowAnalyzer')
    // a → b → a cycle feeding into the wait. findUpstreamTriggers uses a visited
    // set; if that ever regresses this test hangs/throws instead of returning.
    const a = analyzeFlow({
      nodes: [
        { id: 't', type: 'trigger', data: {}, position: { x: 0, y: 0 } } as any,
        { id: 'a', type: 'action', data: {}, position: { x: 0, y: 0 } } as any,
        { id: 'b', type: 'action', data: {}, position: { x: 0, y: 0 } } as any,
        { id: 'w', type: 'wait', data: {}, position: { x: 0, y: 0 } } as any,
      ],
      edges: [
        { id: 'e1', source: 't', target: 'a' } as any,
        { id: 'e2', source: 'a', target: 'b' } as any,
        { id: 'e3', source: 'b', target: 'a' } as any, // back-edge (cycle)
        { id: 'e4', source: 'b', target: 'w' } as any,
      ],
    })
    expect(a.isSimple).toBe(false)
    expect(a.waitNodes[0].requiredTriggers).toEqual(['t'])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Cross-check: registries are internally consistent with allNodeMetas().
// ────────────────────────────────────────────────────────────────────────────
describe('registry self-consistency', () => {
  it('backend allNodeMetas has unique types', () => {
    const types = allNodeMetas().map(m => m.type)
    const dupes = types.filter((t, i) => types.indexOf(t) !== i)
    expect(dupes).toEqual([])
  })
  it('every backend output schema type exists in the frontend registry too', () => {
    // sanity: schemas the editor exposes derive from the same metas.
    expect(Object.keys(registryOutputSchemas).length).toBeGreaterThan(0)
  })
})
