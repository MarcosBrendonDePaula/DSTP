import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `private_message` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'private_message',
  label: "💬 Sussurro",
  icon: "💬",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Comunicação",
  description: "Sussurra mensagem privada para um jogador",
  aiDescription: "Dedicated node for the private_message game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "message",
      "label": "Mensagem",
      "placeholder": "Mensagem privada"
    }
  ],
  defaults: { action_type: 'private_message', params: {} },
  outputSchema: {
    description: 'private_message result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (private_message)' },
    ],
  },
}
