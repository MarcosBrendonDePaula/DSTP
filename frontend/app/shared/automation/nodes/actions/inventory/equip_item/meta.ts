import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `equip_item` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'equip_item',
  label: "🎽 Equipar Item",
  icon: "🎽",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Equipa um item no jogador",
  aiDescription: "Dedicated node for the equip_item game action.",
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
      "placeholder": "spear"
    }
  ],
  defaults: { action_type: 'equip_item', params: {} },
  outputSchema: {
    description: 'equip_item result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (equip_item)' },
    ],
  },
}
