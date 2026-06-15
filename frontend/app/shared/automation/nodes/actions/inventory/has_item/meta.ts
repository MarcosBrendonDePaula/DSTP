import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `has_item` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'has_item',
  label: "❓ Tem Item? (≥N)",
  icon: "❓",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Verifica se o jogador tem N de um item",
  aiDescription: "Dedicated node for the has_item game action.",
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
      "placeholder": "goldnugget"
    },
    {
      "key": "count",
      "label": "Qtd mínima",
      "placeholder": "1"
    },
    {
      "key": "token",
      "label": "Token",
      "placeholder": ""
    }
  ],
  defaults: { action_type: 'has_item', params: {} },
  outputSchema: {
    description: 'has_item result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (has_item)' },
    ],
  },
}
