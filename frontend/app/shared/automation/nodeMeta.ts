// NodeMeta — the single shared declaration for a flow node. Imported by BOTH the
// client editor (palette, icon, config) and the server engine (FlowAnalyzer flow
// flags). It must stay free of any runtime dependency: no React, no bun:sqlite —
// pure data + types only. The React render (ui.tsx) and the execution handler
// (exec.ts) live in sibling files that the two sides import separately.
import type { NodeOutputSchema } from './outputSchema'

export type NodeKind = 'trigger' | 'action' | 'logic' | 'data' | 'ui' | 'ui-primitive' | 'ai'

export interface NodeMeta {
  /** Unique node type id, e.g. 'delay', 'http_request'. Matches the folder name. */
  type: string
  /** Palette/detail label. */
  label: string
  /** Emoji or short glyph shown on the node. */
  icon: string
  /** Hex color for the node border/minimap (unifies the old nodeTypeMeta color +
   *  MiniMap nodeColor). */
  color: string
  /** Tailwind accent class for the palette entry, e.g. 'text-cyan-400'. */
  accent?: string
  /** Palette grouping, e.g. 'Acoes', 'Logica', 'Gatilhos'. */
  category: string
  /** Sub-grouping WITHIN a kind, for the filterable catalog (e.g. 'Jogador',
   *  'Inventário', 'Ramificação'). Lets the catalog show family → subgroup → cards
   *  without a central map — each node declares where it belongs. */
  subgroup?: string
  /** One-line description for the palette (human, in the editor). */
  description: string
  /** Description the AI agent shows the model when this node is wired as a tool.
   *  Replaces the central ACTION_DESCRIPTIONS map in executeAIAgent — each node
   *  documents itself for the model. Falls back to `description` if omitted. */
  aiDescription?: string
  /** Optional per-param hints for the AI tool schema (param key → what it means).
   *  Used to enrich the generated tool input schema instead of "Parameter X". */
  aiParamDescriptions?: Record<string, string>
  /** Allowed values for enum-like params (param key → exact accepted values), so the
   *  flow-generator AI emits a valid `operator`/`event_type`/`action_type` instead of
   *  inventing one. Only list params whose value space is CLOSED; free-text stays
   *  absent. Runtime source of truth is exec.ts / the ui.tsx option lists — kept in
   *  sync by meta-enum.test.ts. */
  aiEnums?: Record<string, string[]>
  /** ONE valid `node.data` object for this node — the literal an author would save,
   *  with correct nesting (flat vs data.params) and a real template ref. The flow
   *  generator copies its shape; highest-leverage field for getting `data` right. */
  aiConfigExample?: Record<string, any>
  /** Short free-form grammar note for nodes a flat example can't fully capture
   *  (ui_builder tree, switch dynamic cases). Rendered verbatim after the example. */
  aiConfigNote?: string
  kind: NodeKind
  /** Form fields rendered in the node body / detail modal. For dedicated action
   *  nodes these were moved OUT of the central ACTION_TYPES catalog so each node
   *  owns its own params (data lives inside the node). key/label/placeholder. */
  params?: Array<{ key: string; label: string; placeholder?: string }>
  /** Initial node.data when created from the palette (replaces createNode defaults). */
  defaults?: Record<string, any>
  /** Output shape for {{node.field}} autocomplete (replaces nodeOutputSchemas). */
  outputSchema?: NodeOutputSchema
  /** Named output handles for edges that branch (condition/switch/foreach/loop/
   *  try_catch). Omit for the common case of a single unnamed output — consumers
   *  (the AI catalog, the validator) treat "no outputHandles" as one default edge.
   *  `dynamic` marks a handle whose exact id is derived at author time from the
   *  node's data (e.g. switch's `case_<i>`, one per entry in data.cases); `id` then
   *  holds the PATTERN and `description` explains how to expand it. The engine's
   *  exec.ts is the source of truth for which handles it actually follows — this
   *  field just MIRRORS that so it can be read without importing the handler. */
  outputHandles?: Array<{ id: string; description?: string; dynamic?: boolean }>
  /** Hide from the palette (internal/child-only nodes). */
  hidden?: boolean
  /** Flow-control flags read by FlowAnalyzer / the engine dispatcher. */
  flow?: {
    /** Entry point — not executed by processNode; matched in evaluateEvent. */
    isTrigger?: boolean
    /** Can pause a stateful branch (wait). */
    pausable?: boolean
  }
}
