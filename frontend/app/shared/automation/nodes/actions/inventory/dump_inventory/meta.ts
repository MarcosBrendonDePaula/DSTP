import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `dump_inventory` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'dump_inventory',
  label: "📋 Listar Inventário",
  icon: "📋",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Lista o conteúdo do inventário do jogador",
  aiDescription: "Dedicated node for the dump_inventory game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "token",
      "label": "Token",
      "placeholder": ""
    }
  ],
  defaults: { action_type: 'dump_inventory', params: {} },
  outputSchema: {
    description: 'dump_inventory result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (dump_inventory)' },
    ],
  },
}
