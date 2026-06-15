import type { Node } from '@xyflow/react'
import { registryTypes } from './registry'

// Action types that, as a generic-action node, must NOT be promoted to a dedicated
// node — their value collides with a DIFFERENT node type. `ui_panel` the action
// (creates a HUD panel command) shares its name with the ui-builder `ui_panel`
// node, so keep it as type:'action'.
const KEEP_AS_ACTION = new Set(['ui_panel'])

// Migrate legacy flows: a node saved as `{ type: 'action', data.action_type: 'X' }`
// becomes the dedicated node `{ type: 'X' }` (e.g. action+heal → heal), so the old
// action-type dropdown disappears and it matches nodes created today. Backend
// dispatch is unchanged (still by data.action_type), so behaviour is identical.
// Idempotent: a node already at a dedicated type is left untouched.
export function migrateLegacyActionNodes(nodes: Node[]): Node[] {
  if (!Array.isArray(nodes)) return nodes
  return nodes.map(n => {
    if (n.type !== 'action') return n
    const at = (n.data as any)?.action_type
    if (!at || KEEP_AS_ACTION.has(at)) return n
    if (!registryTypes.has(at)) return n  // no dedicated node for it → leave generic
    return { ...n, type: at }
  })
}
