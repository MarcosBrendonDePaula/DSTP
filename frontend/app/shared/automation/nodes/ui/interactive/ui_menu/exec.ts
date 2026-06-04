// ui_menu dispatches via runFlowAction exactly like a generic action node, so it
// reuses the action handler (action_type 'ui_menu' → the menu-building path).
export { handler } from '@shared/automation/nodes/actions/game/action/exec'
