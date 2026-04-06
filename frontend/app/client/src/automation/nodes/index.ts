import { TriggerNode } from './triggers/TriggerNode'
import { ConditionNode } from './conditions/ConditionNode'
import { ActionNode } from './actions/ActionNode'
import { HttpRequestNode } from './actions/HttpRequestNode'
import { SetVariableNode } from './actions/SetVariableNode'
import { ScriptNode } from './actions/ScriptNode'
import { DelayNode } from './actions/DelayNode'

export const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  delay: DelayNode,
  http_request: HttpRequestNode,
  set_variable: SetVariableNode,
  script: ScriptNode,
}

export { TriggerNode, TRIGGER_EVENTS } from './triggers/TriggerNode'
export { ConditionNode } from './conditions/ConditionNode'
export { ActionNode, ACTION_TYPES } from './actions/ActionNode'
export { HttpRequestNode } from './actions/HttpRequestNode'
export { SetVariableNode } from './actions/SetVariableNode'
export { ScriptNode } from './actions/ScriptNode'
