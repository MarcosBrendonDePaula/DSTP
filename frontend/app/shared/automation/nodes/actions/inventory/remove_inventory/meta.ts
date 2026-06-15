import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `remove_inventory` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'remove_inventory',
  label: "🗑 Remover Item (slot)",
  icon: "🗑",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Remove o item de um slot do inventário",
  aiDescription: "Dedicated node for the remove_inventory game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "slot",
      "label": "Slot",
      "placeholder": "1"
    }
  ],
  defaults: { action_type: 'remove_inventory', params: {} },
  outputSchema: {
    description: 'remove_inventory result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (remove_inventory)' },
    ],
  },
}
