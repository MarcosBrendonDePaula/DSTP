import { TriggerNode } from './triggers/TriggerNode'
import { ConditionNode } from './conditions/ConditionNode'
import { ActionNode } from './actions/ActionNode'
import { HttpRequestNode } from './actions/HttpRequestNode'
import { SetVariableNode } from './actions/SetVariableNode'

export const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  http_request: HttpRequestNode,
  set_variable: SetVariableNode,
}

export { TriggerNode, TRIGGER_EVENTS } from './triggers/TriggerNode'
export { ConditionNode } from './conditions/ConditionNode'
export { ActionNode, ACTION_TYPES } from './actions/ActionNode'
export { HttpRequestNode } from './actions/HttpRequestNode'
export { SetVariableNode } from './actions/SetVariableNode'
