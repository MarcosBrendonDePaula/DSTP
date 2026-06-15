import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `count_item` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'count_item',
  label: "🔢 Contar Item (prefab)",
  icon: "🔢",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Conta quantos de um prefab o jogador tem",
  aiDescription: "Dedicated node for the count_item game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "prefab",
      "label": "Prefab",
      "placeholder": "log"
    },
    {
      "key": "token",
      "label": "Token (correlação)",
      "placeholder": ""
    }
  ],
  defaults: { action_type: 'count_item', params: {} },
  outputSchema: {
    description: 'count_item result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (count_item)' },
    ],
  },
}
