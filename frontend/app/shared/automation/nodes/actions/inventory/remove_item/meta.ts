import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `remove_item` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'remove_item',
  label: "🗑 Remover Item (prefab, N)",
  icon: "🗑",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Remove N unidades de um prefab do inventário",
  aiDescription: "Dedicated node for the remove_item game action.",
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
      "key": "count",
      "label": "Qtd",
      "placeholder": "1"
    },
    {
      "key": "token",
      "label": "Token (correlação)",
      "placeholder": "{{trigger.callback}}"
    }
  ],
  defaults: { action_type: 'remove_item', params: {} },
  outputSchema: {
    description: 'remove_item result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (remove_item)' },
    ],
  },
}
