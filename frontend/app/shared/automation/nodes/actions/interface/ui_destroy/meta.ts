import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `ui_destroy` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'ui_destroy',
  label: "❌ Remover Widget",
  icon: "❌",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Interface",
  description: "Remove um widget específico do HUD",
  aiDescription: "Dedicated node for the ui_destroy game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "id",
      "label": "Widget ID",
      "placeholder": "meu_label"
    }
  ],
  defaults: { action_type: 'ui_destroy', params: {} },
  outputSchema: {
    description: 'ui_destroy result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (ui_destroy)' },
    ],
  },
}
