import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `rule_uninstall` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'rule_uninstall',
  label: "🖥️ Remover HUD",
  icon: "🖥️",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Regras / Cliente",
  description: "Remove regras de HUD instaladas no cliente",
  aiDescription: "Dedicated node for the rule_uninstall game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "ids",
      "label": "IDs das regras (vírgula)",
      "placeholder": "health_bar,coins_label"
    }
  ],
  defaults: { action_type: 'rule_uninstall', params: {} },
  outputSchema: {
    description: 'rule_uninstall result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (rule_uninstall)' },
    ],
  },
}
