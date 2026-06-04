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
import { meta as actionMeta } from '@shared/automation/nodes/actions/game/action/meta'
import { handler as actionHandler } from '@shared/automation/nodes/actions/game/action/exec'
import { meta as uiPanelMeta } from '@shared/automation/nodes/ui/builder/ui_panel/meta'
import { handler as uiPanelHandler } from '@shared/automation/nodes/ui/builder/ui_panel/exec'

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
  { meta: memoryMeta, handler: memoryHandler },
  { meta: httpMeta, handler: httpHandler },
  { meta: scriptMeta, handler: scriptHandler },
  { meta: uiBuilderMeta, handler: uiBuilderHandler },
  { meta: conditionMeta, handler: conditionHandler },
  { meta: actionMeta, handler: actionHandler },
  { meta: uiPanelMeta, handler: uiPanelHandler },
]

const registry = new Map<string, BackendNodeEntry>(ENTRIES.map(e => [e.meta.type, e]))

/** Lookup a migrated node by type. Returns undefined for legacy/unmigrated nodes. */
export function getNodeEntry(type: string): BackendNodeEntry | undefined {
  return registry.get(type)
}

/** All registered metas (for FlowAnalyzer trigger/pausable flags). */
export function allNodeMetas(): NodeMeta[] {
  return ENTRIES.map(e => e.meta)
}
