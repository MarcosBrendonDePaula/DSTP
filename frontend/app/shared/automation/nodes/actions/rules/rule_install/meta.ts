import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `rule_install` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'rule_install',
  label: "🖥️ Instalar Regra HUD (JSON)",
  icon: "🖥️",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Regras / Cliente",
  description: "Instala regras de HUD declarativas no cliente",
  aiDescription: "Dedicated node for the rule_install game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player (vazio = todos)",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "rules",
      "label": "Rules JSON",
      "placeholder": "[{\"id\":\"my_rule\",\"when\":{\"event\":\"healthdelta\"},\"do\":[...]}]"
    }
  ],
  defaults: { action_type: 'rule_install', params: {} },
  outputSchema: {
    description: 'rule_install result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (rule_install)' },
    ],
  },
}
