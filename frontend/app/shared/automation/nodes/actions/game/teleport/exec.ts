// Reuse the generic action handler — it reads node.data.action_type (fixed to
// 'teleport' by meta.defaults) and dispatches via runFlowAction. No new Lua, no new
// dispatch: just the existing teleport command surfaced as a first-class node.
export { handler } from '../action/exec'
