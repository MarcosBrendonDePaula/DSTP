import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `ui_notification` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'ui_notification',
  label: "🔔 Notificação",
  icon: "🔔",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Interface",
  description: "Mostra notificação toast no topo do cliente",
  aiDescription: "Dedicated node for the ui_notification game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "text",
      "label": "Texto",
      "placeholder": "Mensagem..."
    },
    {
      "key": "duration",
      "label": "Duração (s)",
      "placeholder": "5"
    }
  ],
  defaults: { action_type: 'ui_notification', params: {} },
  outputSchema: {
    description: 'ui_notification result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (ui_notification)' },
    ],
  },
}
