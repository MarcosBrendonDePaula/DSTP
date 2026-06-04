// Frontend node registry — the client-side half of the module-per-node system.
// Mirrors the backend registry (app/server/live/nodes/registry.ts): one explicit
// import per migrated node, no glob. Each node contributes its meta (shared) and
// ui (the canvas component). Everything the editor needs — nodeTypes, palette
// entries, defaults, output schemas, colors — derives from here.
//
// During migration this only holds MIGRATED nodes; the legacy index.ts / catalog
// arrays fill the rest. Once all nodes are migrated, the legacy lists are removed.
import type { ComponentType } from 'react'
import type { NodeMeta } from '@shared/automation/nodeMeta'
import type { NodeOutputSchema } from '@shared/automation/outputSchema'

import { meta as delayMeta } from '@shared/automation/nodes/logic/timing/delay/meta'
import { ui as delayUi } from '@shared/automation/nodes/logic/timing/delay/ui'
import { meta as setVarMeta } from '@shared/automation/nodes/data/vars/set_variable/meta'
import { ui as setVarUi } from '@shared/automation/nodes/data/vars/set_variable/ui'
import { meta as getPlayerMeta } from '@shared/automation/nodes/data/player/get_player/meta'
import { ui as getPlayerUi } from '@shared/automation/nodes/data/player/get_player/ui'
import { meta as findPlayerMeta } from '@shared/automation/nodes/data/player/find_player/meta'
import { ui as findPlayerUi } from '@shared/automation/nodes/data/player/find_player/ui'
import { meta as memoryMeta } from '@shared/automation/nodes/data/store/memory/meta'
import { ui as memoryUi } from '@shared/automation/nodes/data/store/memory/ui'
import { meta as httpMeta } from '@shared/automation/nodes/actions/http/http_request/meta'
import { ui as httpUi } from '@shared/automation/nodes/actions/http/http_request/ui'
import { meta as scriptMeta } from '@shared/automation/nodes/actions/code/script/meta'
import { ui as scriptUi } from '@shared/automation/nodes/actions/code/script/ui'
import { meta as uiBuilderMeta } from '@shared/automation/nodes/ui/builder/ui_builder/meta'
import { ui as uiBuilderUi } from '@shared/automation/nodes/ui/builder/ui_builder/ui'
import { meta as conditionMeta } from '@shared/automation/nodes/logic/branch/condition/meta'
import { ui as conditionUi } from '@shared/automation/nodes/logic/branch/condition/ui'
import { meta as actionMeta } from '@shared/automation/nodes/actions/game/action/meta'
import { ui as actionUi } from '@shared/automation/nodes/actions/game/action/ui'
import { meta as uiPanelMeta } from '@shared/automation/nodes/ui/builder/ui_panel/meta'
import { ui as uiPanelUi } from '@shared/automation/nodes/ui/builder/ui_panel/ui'

interface FrontendNodeEntry {
  meta: NodeMeta
  ui: ComponentType<any>
}

// ── Registered node modules (one entry per migrated node) ──
const ENTRIES: FrontendNodeEntry[] = [
  { meta: delayMeta, ui: delayUi },
  { meta: setVarMeta, ui: setVarUi },
  { meta: getPlayerMeta, ui: getPlayerUi },
  { meta: findPlayerMeta, ui: findPlayerUi },
  { meta: memoryMeta, ui: memoryUi },
  { meta: httpMeta, ui: httpUi },
  { meta: scriptMeta, ui: scriptUi },
  { meta: uiBuilderMeta, ui: uiBuilderUi },
  { meta: conditionMeta, ui: conditionUi },
  { meta: actionMeta, ui: actionUi },
  { meta: uiPanelMeta, ui: uiPanelUi },
]

// ── Derived maps (consumed by FlowEditor / NodeDetailPanel / nodes/index) ──

/** type → canvas component (merged into ReactFlow nodeTypes). */
export const registryNodeTypes: Record<string, ComponentType<any>> =
  Object.fromEntries(ENTRIES.map(e => [e.meta.type, e.ui]))

/** type → meta (icon/label/color/category…). */
export const registryMetaByType: Record<string, NodeMeta> =
  Object.fromEntries(ENTRIES.map(e => [e.meta.type, e.meta]))

/** type → initial node.data (palette create defaults). */
export const registryDefaults: Record<string, any> =
  Object.fromEntries(ENTRIES.map(e => [e.meta.type, e.meta.defaults ?? {}]))

/** type → output schema (for {{node.field}} autocomplete). */
export const registryOutputSchemas: Record<string, NodeOutputSchema> =
  Object.fromEntries(ENTRIES.filter(e => e.meta.outputSchema).map(e => [e.meta.type, e.meta.outputSchema!]))

/** Palette catalog items for migrated, non-hidden nodes. */
export const registryCatalog = ENTRIES
  .filter(e => !e.meta.hidden)
  .map(e => ({
    type: e.meta.type,
    label: e.meta.label,
    description: e.meta.description,
    category: e.meta.category,
    icon: e.meta.icon,
    accent: e.meta.accent ?? 'text-gray-400',
    data: e.meta.defaults,
  }))

/** Set of types owned by the registry (so legacy lists can skip them). */
export const registryTypes = new Set(ENTRIES.map(e => e.meta.type))
