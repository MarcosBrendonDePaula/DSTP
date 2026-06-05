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
import { meta as playerStateMeta } from '@shared/automation/nodes/data/player/player_state/meta'
import { ui as playerStateUi } from '@shared/automation/nodes/data/player/player_state/ui'
import { meta as callComponentMeta } from '@shared/automation/nodes/data/player/call_component/meta'
import { ui as callComponentUi } from '@shared/automation/nodes/data/player/call_component/ui'
import { meta as landClaimMeta } from '@shared/automation/nodes/data/world/land_claim/meta'
import { ui as landClaimUi } from '@shared/automation/nodes/data/world/land_claim/ui'
import { meta as memoryMeta } from '@shared/automation/nodes/data/store/memory/meta'
import { ui as memoryUi } from '@shared/automation/nodes/data/store/memory/ui'
import { meta as listFlowsMeta } from '@shared/automation/nodes/data/store/list_flows/meta'
import { ui as listFlowsUi } from '@shared/automation/nodes/data/store/list_flows/ui'
import { meta as httpMeta } from '@shared/automation/nodes/actions/http/http_request/meta'
import { ui as httpUi } from '@shared/automation/nodes/actions/http/http_request/ui'
import { meta as scriptMeta } from '@shared/automation/nodes/actions/code/script/meta'
import { ui as scriptUi } from '@shared/automation/nodes/actions/code/script/ui'
import { meta as uiBuilderMeta } from '@shared/automation/nodes/ui/builder/ui_builder/meta'
import { ui as uiBuilderUi } from '@shared/automation/nodes/ui/builder/ui_builder/ui'
import { meta as conditionMeta } from '@shared/automation/nodes/logic/branch/condition/meta'
import { ui as conditionUi } from '@shared/automation/nodes/logic/branch/condition/ui'
import { meta as switchMeta } from '@shared/automation/nodes/logic/branch/switch/meta'
import { ui as switchUi } from '@shared/automation/nodes/logic/branch/switch/ui'
import { meta as foreachMeta } from '@shared/automation/nodes/logic/loop/foreach/meta'
import { ui as foreachUi } from '@shared/automation/nodes/logic/loop/foreach/ui'
import { meta as filterMeta } from '@shared/automation/nodes/logic/branch/filter/meta'
import { ui as filterUi } from '@shared/automation/nodes/logic/branch/filter/ui'
import { meta as logMeta } from '@shared/automation/nodes/data/debug/log/meta'
import { ui as logUi } from '@shared/automation/nodes/data/debug/log/ui'
import { meta as randomMeta } from '@shared/automation/nodes/data/random/random/meta'
import { ui as randomUi } from '@shared/automation/nodes/data/random/random/ui'
import { meta as transformMeta } from '@shared/automation/nodes/data/transform/transform/meta'
import { ui as transformUi } from '@shared/automation/nodes/data/transform/transform/ui'
import { meta as splitMeta } from '@shared/automation/nodes/data/transform/split/meta'
import { ui as splitUi } from '@shared/automation/nodes/data/transform/split/ui'
import { meta as actionMeta } from '@shared/automation/nodes/actions/game/action/meta'
import { ui as actionUi } from '@shared/automation/nodes/actions/game/action/ui'
import { meta as uiPanelMeta } from '@shared/automation/nodes/ui/builder/ui_panel/meta'
import { ui as uiPanelUi } from '@shared/automation/nodes/ui/builder/ui_panel/ui'
import { meta as aiAgentMeta } from '@shared/automation/nodes/ai/agent/ai_agent/meta'
import { ui as aiAgentUi } from '@shared/automation/nodes/ai/agent/ai_agent/ui'
import { meta as uiColMeta } from '@shared/automation/nodes/ui/primitives/ui_col/meta'
import { ui as uiColUi } from '@shared/automation/nodes/ui/primitives/ui_col/ui'
import { meta as uiRowMeta } from '@shared/automation/nodes/ui/primitives/ui_row/meta'
import { ui as uiRowUi } from '@shared/automation/nodes/ui/primitives/ui_row/ui'
import { meta as uiTabsMeta } from '@shared/automation/nodes/ui/primitives/ui_tabs/meta'
import { ui as uiTabsUi } from '@shared/automation/nodes/ui/primitives/ui_tabs/ui'
import { meta as uiTextMeta } from '@shared/automation/nodes/ui/primitives/ui_text/meta'
import { ui as uiTextUi } from '@shared/automation/nodes/ui/primitives/ui_text/ui'
import { meta as uiTextInputMeta } from '@shared/automation/nodes/ui/primitives/ui_text_input/meta'
import { ui as uiTextInputUi } from '@shared/automation/nodes/ui/primitives/ui_text_input/ui'
import { meta as uiIconMeta } from '@shared/automation/nodes/ui/primitives/ui_icon/meta'
import { ui as uiIconUi } from '@shared/automation/nodes/ui/primitives/ui_icon/ui'
import { meta as uiButtonMeta } from '@shared/automation/nodes/ui/primitives/ui_button/meta'
import { ui as uiButtonUi } from '@shared/automation/nodes/ui/primitives/ui_button/ui'
import { meta as uiBarMeta } from '@shared/automation/nodes/ui/primitives/ui_bar/meta'
import { ui as uiBarUi } from '@shared/automation/nodes/ui/primitives/ui_bar/ui'
import { meta as uiSpacerMeta } from '@shared/automation/nodes/ui/primitives/ui_spacer/meta'
import { ui as uiSpacerUi } from '@shared/automation/nodes/ui/primitives/ui_spacer/ui'
import { meta as uiMenuMeta } from '@shared/automation/nodes/ui/interactive/ui_menu/meta'
import { ui as uiMenuUi } from '@shared/automation/nodes/ui/interactive/ui_menu/ui'
import { meta as uiRuleMeta } from '@shared/automation/nodes/ui/interactive/ui_rule/meta'
import { ui as uiRuleUi } from '@shared/automation/nodes/ui/interactive/ui_rule/ui'
import { meta as aiMemoryMeta } from '@shared/automation/nodes/ai/memory/ai_memory/meta'
import { ui as aiMemoryUi } from '@shared/automation/nodes/ai/memory/ai_memory/ui'
import { meta as triggerMeta } from '@shared/automation/nodes/triggers/game/trigger/meta'
import { ui as triggerUi } from '@shared/automation/nodes/triggers/game/trigger/ui'
import { meta as webhookMeta } from '@shared/automation/nodes/triggers/net/webhook/meta'
import { ui as webhookUi } from '@shared/automation/nodes/triggers/net/webhook/ui'
import { meta as waitMeta } from '@shared/automation/nodes/logic/merge/wait/meta'
import { ui as waitUi } from '@shared/automation/nodes/logic/merge/wait/ui'

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
  { meta: playerStateMeta, ui: playerStateUi },
  { meta: callComponentMeta, ui: callComponentUi },
  { meta: landClaimMeta, ui: landClaimUi },
  { meta: memoryMeta, ui: memoryUi },
  { meta: listFlowsMeta, ui: listFlowsUi },
  { meta: httpMeta, ui: httpUi },
  { meta: scriptMeta, ui: scriptUi },
  { meta: uiBuilderMeta, ui: uiBuilderUi },
  { meta: conditionMeta, ui: conditionUi },
  { meta: switchMeta, ui: switchUi },
  { meta: foreachMeta, ui: foreachUi },
  { meta: filterMeta, ui: filterUi },
  { meta: logMeta, ui: logUi },
  { meta: randomMeta, ui: randomUi },
  { meta: transformMeta, ui: transformUi },
  { meta: splitMeta, ui: splitUi },
  { meta: actionMeta, ui: actionUi },
  { meta: uiPanelMeta, ui: uiPanelUi },
  { meta: aiAgentMeta, ui: aiAgentUi },
  { meta: uiColMeta, ui: uiColUi },
  { meta: uiRowMeta, ui: uiRowUi },
  { meta: uiTabsMeta, ui: uiTabsUi },
  { meta: uiTextMeta, ui: uiTextUi },
  { meta: uiTextInputMeta, ui: uiTextInputUi },
  { meta: uiIconMeta, ui: uiIconUi },
  { meta: uiButtonMeta, ui: uiButtonUi },
  { meta: uiBarMeta, ui: uiBarUi },
  { meta: uiSpacerMeta, ui: uiSpacerUi },
  { meta: uiMenuMeta, ui: uiMenuUi },
  { meta: uiRuleMeta, ui: uiRuleUi },
  { meta: aiMemoryMeta, ui: aiMemoryUi },
  { meta: triggerMeta, ui: triggerUi },
  { meta: webhookMeta, ui: webhookUi },
  { meta: waitMeta, ui: waitUi },
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

/** Palette catalog items for migrated, non-hidden nodes. `family` comes from the
 *  node's own meta.kind — the node declares its menu family, no string guessing. */
export const registryCatalog = ENTRIES
  .filter(e => !e.meta.hidden)
  .map(e => ({
    type: e.meta.type,
    label: e.meta.label,
    description: e.meta.description,
    category: e.meta.category,
    family: e.meta.kind,
    icon: e.meta.icon,
    accent: e.meta.accent ?? 'text-gray-400',
    data: e.meta.defaults,
  }))

/** Set of types owned by the registry (so legacy lists can skip them). */
export const registryTypes = new Set(ENTRIES.map(e => e.meta.type))
