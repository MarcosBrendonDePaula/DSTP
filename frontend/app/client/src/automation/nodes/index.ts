import { TriggerNode } from './triggers/TriggerNode'
import { ConditionNode } from './conditions/ConditionNode'
import { ActionNode } from './actions/ActionNode'
import { HttpRequestNode } from './actions/HttpRequestNode'
import { SetVariableNode } from './actions/SetVariableNode'
import { ScriptNode } from './actions/ScriptNode'
import { DelayNode } from './actions/DelayNode'
import { GetPlayerNode } from './actions/GetPlayerNode'
import { FindPlayerNode } from './actions/FindPlayerNode'
import { WaitNode } from './actions/WaitNode'
import { MemoryNode } from './actions/MemoryNode'
import { MenuNode } from './actions/MenuNode'
import { HudRuleNode } from './actions/HudRuleNode'
import { UIBuilderNode, UIPanelNode, UIColNode, UIRowNode, UITabsNode, UITextNode, UIIconNode, UIButtonNode, UIBarNode, UISpacerNode } from './ui'
import { AIAgentNode } from './ai/AIAgentNode'

export const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  delay: DelayNode,
  get_player: GetPlayerNode,
  find_player: FindPlayerNode,
  http_request: HttpRequestNode,
  set_variable: SetVariableNode,
  script: ScriptNode,
  wait: WaitNode,
  memory: MemoryNode,
  ai_agent: AIAgentNode,
  ui_menu: MenuNode,
  ui_rule: HudRuleNode,
  ui_builder: UIBuilderNode,
  ui_panel: UIPanelNode,
  ui_col: UIColNode,
  ui_row: UIRowNode,
  ui_tabs: UITabsNode,
  ui_text: UITextNode,
  ui_icon: UIIconNode,
  ui_button: UIButtonNode,
  ui_bar: UIBarNode,
  ui_spacer: UISpacerNode,
}

export { TriggerNode, TRIGGER_EVENTS } from './triggers/TriggerNode'
export { ConditionNode } from './conditions/ConditionNode'
export { ActionNode, ACTION_TYPES } from './actions/ActionNode'
export { HttpRequestNode } from './actions/HttpRequestNode'
export { SetVariableNode } from './actions/SetVariableNode'
export { ScriptNode } from './actions/ScriptNode'
