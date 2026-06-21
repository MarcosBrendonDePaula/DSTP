// Node-catalog serializer — turns the node registry into a compact, LLM-readable
// description of every standalone node type, so an LLM can generate/edit a valid
// flow graph. Read by the AI flow generator (generateFlow/editFlow) and vendable
// via an endpoint for the editor.
//
// What it deliberately omits: the React ui.tsx, exec.ts internals, colors/icons —
// none of that helps the model wire a graph. What it includes: type, what the node
// does, its params (with an inferred type hint + required flag), its output fields
// ({{node.field}}), and its OUTPUT HANDLES (how to branch). Handles come from
// meta.outputHandles (mirrors exec.ts; see output-handles.test.ts).
//
// Excluded from the catalog: hidden metas (bare trigger/action shells) and
// ui-primitive nodes (only valid nested inside a ui_builder/ui_panel tree, never
// wired as standalone graph nodes).

import { allNodeMetas } from './registry'
import type { NodeMeta } from '@shared/automation/nodeMeta'

// Mirrors FlowEngine.NUMERIC_PARAM_KEYS / BOOLEAN_PARAM_KEYS. Duplicated (not
// imported) so this module stays free of FlowEngine's bun:sqlite-laden import graph.
// Kept in sync by catalogSerializer.test.ts.
const NUMERIC_PARAM_KEYS = new Set([
  'amount', 'count', 'x', 'y', 'z', 'radius', 'limit', 'duration', 'days', 'speed',
  'length', 'day', 'dusk', 'night', 'slot', 'width', 'height', 'value', 'max',
  'offset_x', 'offset_z', 'guid', 'percent', 'delta', 'coldness',
])
const BOOLEAN_PARAM_KEYS = new Set(['enabled', 'drop', 'visible'])

function paramType(key: string): 'string' | 'number' | 'boolean' {
  if (BOOLEAN_PARAM_KEYS.has(key)) return 'boolean'
  if (NUMERIC_PARAM_KEYS.has(key)) return 'number'
  return 'string'
}

export interface CatalogParam {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
  placeholder?: string
  description?: string
}

export interface CatalogEntry {
  type: string
  label: string
  kind: NodeMeta['kind']
  category: string
  /** What the node does — aiDescription if present, else the human description. */
  description: string
  isTrigger: boolean
  params: CatalogParam[]
  outputFields: Array<{ name: string; type: string; description: string }>
  outputHandles: Array<{ id: string; description?: string; dynamic?: boolean }>
  /** Allowed values for enum-like params (param → values). From meta.aiEnums. */
  enums?: Record<string, string[]>
  /** A valid `data` object the AI should copy the SHAPE of, JSON-stringified. From
   *  meta.aiConfigExample, else the node's own non-empty defaults. */
  example?: string
  /** Short grammar note for compound nodes (ui_builder tree, switch cases). */
  note?: string
}

/** A param is "required" when the node ships no default for it (the author/AI must
 *  fill it). defaults may nest params under `defaults.params`. */
function defaultFor(meta: NodeMeta, key: string): any {
  const d: any = meta.defaults ?? {}
  if (d.params && Object.prototype.hasOwnProperty.call(d.params, key)) return d.params[key]
  return d[key]
}

function serializeOne(meta: NodeMeta): CatalogEntry {
  const params: CatalogParam[] = (meta.params ?? []).map((p) => {
    const def = defaultFor(meta, p.key)
    const required = def === undefined || def === ''
    return {
      key: p.key,
      label: p.label,
      type: paramType(p.key),
      required,
      placeholder: p.placeholder,
      description: meta.aiParamDescriptions?.[p.key],
    }
  })

  // Example data: the explicit aiConfigExample wins; else fall back to the node's own
  // defaults when they carry real values (dedicated action nodes ship a filled
  // params), so most nodes get a shape to copy for free without per-node authoring.
  let example: string | undefined
  if (meta.aiConfigExample) {
    example = JSON.stringify(meta.aiConfigExample)
  } else if (meta.defaults && hasRealValues(meta.defaults)) {
    example = JSON.stringify(meta.defaults)
  }

  return {
    type: meta.type,
    label: meta.label,
    kind: meta.kind,
    category: meta.category,
    description: meta.aiDescription ?? meta.description,
    isTrigger: !!meta.flow?.isTrigger,
    params,
    outputFields: meta.outputSchema?.fields ?? [],
    // Default: a single unnamed output edge. Branching nodes override via meta.
    outputHandles: meta.outputHandles ?? [{ id: '', description: 'Single output (sequential).' }],
    enums: meta.aiEnums,
    example,
    note: meta.aiConfigNote,
  }
}

// True when a defaults object has at least one non-empty leaf value (so it's worth
// showing as an example, vs an all-blank `{ params: { key: '' } }`).
function hasRealValues(obj: any): boolean {
  if (obj == null) return false
  if (typeof obj !== 'object') return obj !== '' && obj !== undefined
  return Object.values(obj).some(hasRealValues)
}

/** True when a node can be a standalone graph node the AI may emit. Excludes hidden
 *  shells and ui-primitives (only valid nested in a UI tree). */
export function isStandalone(meta: NodeMeta): boolean {
  if (meta.hidden) return false
  if (meta.kind === 'ui-primitive') return false
  return true
}

/** The full LLM-facing catalog: every standalone node, serialized. */
export function buildNodeCatalog(): CatalogEntry[] {
  return allNodeMetas()
    .filter(isStandalone)
    .map(serializeOne)
    .sort((a, b) => a.type.localeCompare(b.type))
}

/** Compact text rendering for a system prompt (cheaper than raw JSON, still exact). */
export function renderCatalogForPrompt(catalog: CatalogEntry[] = buildNodeCatalog()): string {
  return catalog
    .map((n) => {
      const trig = n.isTrigger ? ' [TRIGGER/entry]' : ''
      const params = n.params.length
        ? n.params.map((p) => `${p.key}:${p.type}${p.required ? '*' : ''}`).join(', ')
        : '(none)'
      const handles = n.outputHandles.map((h) => h.id || 'out').join(' | ')
      const outs = n.outputFields.length ? n.outputFields.map((f) => f.name).join(', ') : '(none)'
      const lines = [
        `- ${n.type}${trig} — ${n.description}`,
        `    params: ${params}`,
      ]
      if (n.enums) for (const [k, vs] of Object.entries(n.enums)) lines.push(`    ${k}: ${vs.join('|')}`)
      if (n.example) lines.push(`    example data: ${n.example}`)
      if (n.note) lines.push(`    note: ${n.note}`)
      lines.push(`    out handles: ${handles}`, `    out fields: ${outs}`)
      return lines.join('\n')
    })
    .join('\n')
}
