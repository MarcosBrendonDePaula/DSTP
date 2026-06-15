import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `clear_inventory` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'clear_inventory',
  label: "🧹 Limpar Inventário",
  icon: "🧹",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Esvazia o inventário do jogador",
  aiDescription: "Dedicated node for the clear_inventory game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "prefab",
      "label": "Só este prefab (vazio=tudo)",
      "placeholder": ""
    }
  ],
  defaults: { action_type: 'clear_inventory', params: {} },
  outputSchema: {
    description: 'clear_inventory result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (clear_inventory)' },
    ],
  },
}
