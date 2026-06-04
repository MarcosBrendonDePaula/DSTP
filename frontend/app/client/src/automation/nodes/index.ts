// All flow node types now come from the module registry (one folder per node).
// This barrel just re-exports what the editor imports by name.
import { registryNodeTypes } from './registry'

export const nodeTypes = registryNodeTypes

// TRIGGER_EVENTS lives in the trigger module; ACTION_TYPES in actionTypes.ts
// (action subtypes are NOT node modules). Re-exported here for existing imports.
export { TRIGGER_EVENTS } from '@shared/automation/nodes/triggers/game/trigger/ui'
export { ACTION_TYPES } from './actions/actionTypes'
