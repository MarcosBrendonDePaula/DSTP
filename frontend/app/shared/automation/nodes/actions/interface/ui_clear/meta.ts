import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `ui_clear` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'ui_clear',
  label: "🧹 Limpar Widgets",
  icon: "🧹",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Interface",
  description: "Remove todos os widgets do HUD do jogador",
  aiDescription: "Dedicated node for the ui_clear game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    }
  ],
  defaults: { action_type: 'ui_clear', params: {} },
  outputSchema: {
    description: 'ui_clear result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (ui_clear)' },
    ],
  },
}
