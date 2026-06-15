import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `unequip` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'unequip',
  label: "🧤 Desequipar (slot)",
  icon: "🧤",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Inventário",
  description: "Desequipa o item de um slot (mão/corpo/cabeça)",
  aiDescription: "Dedicated node for the unequip game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "slot",
      "label": "Slot (hand/body/head)",
      "placeholder": "hand"
    },
    {
      "key": "drop",
      "label": "Dropar? (true)",
      "placeholder": ""
    }
  ],
  defaults: { action_type: 'unequip', params: {} },
  outputSchema: {
    description: 'unequip result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (unequip)' },
    ],
  },
}
