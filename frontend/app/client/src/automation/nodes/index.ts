import { TriggerNode } from './triggers/TriggerNode'
import { ConditionNode } from './conditions/ConditionNode'
import { ActionNode } from './actions/ActionNode'

export const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
}

export { TriggerNode, TRIGGER_EVENTS } from './triggers/TriggerNode'
export { ConditionNode } from './conditions/ConditionNode'
export { ActionNode, ACTION_TYPES } from './actions/ActionNode'
