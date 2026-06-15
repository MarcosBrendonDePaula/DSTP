import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `rule_set_state` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'rule_set_state',
  label: "🗃 Setar Estado Client",
  icon: "🗃",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Regras / Cliente",
  description: "Define um valor de estado no cliente",
  aiDescription: "Dedicated node for the rule_set_state game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "key",
      "label": "Chave",
      "placeholder": "coins"
    },
    {
      "key": "value",
      "label": "Valor",
      "placeholder": "100"
    }
  ],
  defaults: { action_type: 'rule_set_state', params: {} },
  outputSchema: {
    description: 'rule_set_state result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (rule_set_state)' },
    ],
  },
}
