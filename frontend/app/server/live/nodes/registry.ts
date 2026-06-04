// Backend node registry — the single place that knows which node types have a
// migrated module (meta + exec handler). Registration is by EXPLICIT static
// import: the backend ships as one bundled dist/index.js, so runtime FS globs
// (Bun.Glob) or import.meta.glob (unsupported by Bun) would break in production.
// Static imports are followed by the bundler and work in dev and prod alike.
//
// To migrate a node: add its folder under app/shared/automation/nodes/<type>/
// (meta.ts + exec.ts) and add ONE line below. Everything else (dispatch, palette,
// FlowAnalyzer flags) derives from this registry. Until a node is registered here,
// the engine falls back to the legacy if/else in processNode.
import type { NodeMeta } from '@shared/automation/nodeMeta'
import type { NodeHandler } from './types'

import { meta as delayMeta } from '@shared/automation/nodes/logic/timing/delay/meta'
import { handler as delayHandler } from '@shared/automation/nodes/logic/timing/delay/exec'
import { meta as setVarMeta } from '@shared/automation/nodes/data/vars/set_variable/meta'
import { handler as setVarHandler } from '@shared/automation/nodes/data/vars/set_variable/exec'
import { meta as getPlayerMeta } from '@shared/automation/nodes/data/player/get_player/meta'
import { handler as getPlayerHandler } from '@shared/automation/nodes/data/player/get_player/exec'
import { meta as findPlayerMeta } from '@shared/automation/nodes/data/player/find_player/meta'
import { handler as findPlayerHandler } from '@shared/automation/nodes/data/player/find_player/exec'
import { meta as playerStateMeta } from '@shared/automation/nodes/data/player/player_state/meta'
import { handler as playerStateHandler } from '@shared/automation/nodes/data/player/player_state/exec'
import { meta as callComponentMeta } from '@shared/automation/nodes/data/player/call_component/meta'
import { handler as callComponentHandler } from '@shared/automation/nodes/data/player/call_component/exec'
import { meta as memoryMeta } from '@shared/automation/nodes/data/store/memory/meta'
import { handler as memoryHandler } from '@shared/automation/nodes/data/store/memory/exec'
import { meta as httpMeta } from '@shared/automation/nodes/actions/http/http_request/meta'
import { handler as httpHandler } from '@shared/automation/nodes/actions/http/http_request/exec'
import { meta as scriptMeta } from '@shared/automation/nodes/actions/code/script/meta'
import { handler as scriptHandler } from '@shared/automation/nodes/actions/code/script/exec'
import { meta as uiBuilderMeta } from '@shared/automation/nodes/ui/builder/ui_builder/meta'
import { handler as uiBuilderHandler } from '@shared/automation/nodes/ui/builder/ui_builder/exec'
import { meta as conditionMeta } from '@shared/automation/nodes/logic/branch/condition/meta'
import { handler as conditionHandler } from '@shared/automation/nodes/logic/branch/condition/exec'
import { meta as switchMeta } from '@shared/automation/nodes/logic/branch/switch/meta'
import { handler as switchHandler } from '@shared/automation/nodes/logic/branch/switch/exec'
import { meta as foreachMeta } from '@shared/automation/nodes/logic/loop/foreach/meta'
import { handler as foreachHandler } from '@shared/automation/nodes/logic/loop/foreach/exec'
import { meta as filterMeta } from '@shared/automation/nodes/logic/branch/filter/meta'
import { handler as filterHandler } from '@shared/automation/nodes/logic/branch/filter/exec'
import { meta as logMeta } from '@shared/automation/nodes/data/debug/log/meta'
import { handler as logHandler } from '@shared/automation/nodes/data/debug/log/exec'
import { meta as randomMeta } from '@shared/automation/nodes/data/random/random/meta'
import { handler as randomHandler } from '@shared/automation/nodes/data/random/random/exec'
import { meta as transformMeta } from '@shared/automation/nodes/data/transform/transform/meta'
import { handler as transformHandler } from '@shared/automation/nodes/data/transform/transform/exec'
import { meta as actionMeta } from '@shared/automation/nodes/actions/game/action/meta'
import { handler as actionHandler } from '@shared/automation/nodes/actions/game/action/exec'
import { meta as uiPanelMeta } from '@shared/automation/nodes/ui/builder/ui_panel/meta'
import { handler as uiPanelHandler } from '@shared/automation/nodes/ui/builder/ui_panel/exec'
import { meta as aiAgentMeta } from '@shared/automation/nodes/ai/agent/ai_agent/meta'
import { handler as aiAgentHandler } from '@shared/automation/nodes/ai/agent/ai_agent/exec'
import { meta as uiMenuMeta } from '@shared/automation/nodes/ui/interactive/ui_menu/meta'
import { handler as uiMenuHandler } from '@shared/automation/nodes/ui/interactive/ui_menu/exec'
import { meta as uiRuleMeta } from '@shared/automation/nodes/ui/interactive/ui_rule/meta'
import { handler as uiRuleHandler } from '@shared/automation/nodes/ui/interactive/ui_rule/exec'

// No-exec metas: triggers (entry points matched in evaluateEvent) and wait (its
// stateful execution lives in the orchestrator, not a handler). Kept for the
// FlowAnalyzer isTrigger/pausable flags.
import { meta as triggerMeta } from '@shared/automation/nodes/triggers/game/trigger/meta'
import { meta as webhookMeta } from '@shared/automation/nodes/triggers/net/webhook/meta'
import { meta as waitMeta } from '@shared/automation/nodes/logic/merge/wait/meta'

export interface BackendNodeEntry {
  meta: NodeMeta
  handler: NodeHandler
}

// ── Registered node modules (one entry per migrated node) ──
const ENTRIES: BackendNodeEntry[] = [
  { meta: delayMeta, handler: delayHandler },
  { meta: setVarMeta, handler: setVarHandler },
  { meta: getPlayerMeta, handler: getPlayerHandler },
  { meta: findPlayerMeta, handler: findPlayerHandler },
  { meta: playerStateMeta, handler: playerStateHandler },
  { meta: callComponentMeta, handler: callComponentHandler },
  { meta: memoryMeta, handler: memoryHandler },
  { meta: httpMeta, handler: httpHandler },
  { meta: scriptMeta, handler: scriptHandler },
  { meta: uiBuilderMeta, handler: uiBuilderHandler },
  { meta: conditionMeta, handler: conditionHandler },
  { meta: switchMeta, handler: switchHandler },
  { meta: foreachMeta, handler: foreachHandler },
  { meta: filterMeta, handler: filterHandler },
  { meta: logMeta, handler: logHandler },
  { meta: randomMeta, handler: randomHandler },
  { meta: transformMeta, handler: transformHandler },
  { meta: actionMeta, handler: actionHandler },
  { meta: uiPanelMeta, handler: uiPanelHandler },
  { meta: aiAgentMeta, handler: aiAgentHandler },
  { meta: uiMenuMeta, handler: uiMenuHandler },
  { meta: uiRuleMeta, handler: uiRuleHandler },
]

// No-handler metas (triggers + wait), kept apart from the dispatch ENTRIES.
const NO_EXEC_METAS: NodeMeta[] = [triggerMeta, webhookMeta, waitMeta]

const registry = new Map<string, BackendNodeEntry>(ENTRIES.map(e => [e.meta.type, e]))

/** Lookup a migrated node by type. Returns undefined for legacy/unmigrated nodes. */
export function getNodeEntry(type: string): BackendNodeEntry | undefined {
  return registry.get(type)
}

/** All node metas incl. triggers/wait (for FlowAnalyzer trigger/pausable flags). */
export function allNodeMetas(): NodeMeta[] {
  return [...ENTRIES.map(e => e.meta), ...NO_EXEC_METAS]
}
