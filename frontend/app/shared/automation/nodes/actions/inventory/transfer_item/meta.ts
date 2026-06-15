import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `transfer_item` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'transfer_item',
  label: "🔄 Transferir Item",
  icon: "🔄",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Transfere itens de um jogador para outro",
  aiDescription: "Dedicated node for the transfer_item game action.",
  kind: 'action',
  params: [
    {
      "key": "from_userid",
      "label": "De (User ID)",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "to_userid",
      "label": "Para (User ID)",
      "placeholder": "{{alvo.userid}}"
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
      "label": "Token",
      "placeholder": ""
    }
  ],
  defaults: { action_type: 'transfer_item', params: {} },
  outputSchema: {
    description: 'transfer_item result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (transfer_item)' },
    ],
  },
}
