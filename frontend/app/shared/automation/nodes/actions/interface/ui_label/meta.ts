import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `ui_label` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'ui_label',
  label: "🏷 Label HUD",
  icon: "🏷",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Interface",
  description: "Cria texto fixo no HUD do jogador",
  aiDescription: "Dedicated node for the ui_label game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "id",
      "label": "ID",
      "placeholder": "meu_label"
    },
    {
      "key": "text",
      "label": "Texto",
      "placeholder": "Info..."
    },
    {
      "key": "x",
      "label": "X",
      "placeholder": "0"
    },
    {
      "key": "y",
      "label": "Y",
      "placeholder": "300"
    },
    {
      "key": "anchor",
      "label": "Ancora",
      "placeholder": "top"
    }
  ],
  defaults: { action_type: 'ui_label', params: {} },
  outputSchema: {
    description: 'ui_label result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (ui_label)' },
    ],
  },
}
