// ui_rule dispatches via runFlowAction like a generic action (action_type
// 'rule_install'/'rule_uninstall'/'rule_set_state'), so it reuses the handler.
export { handler } from '@shared/automation/nodes/actions/game/action/exec'
