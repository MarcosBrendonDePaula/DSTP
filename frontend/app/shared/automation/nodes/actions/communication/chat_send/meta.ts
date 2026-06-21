import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `chat_send` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'chat_send',
  label: "💬 Chat Send",
  icon: "💬",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Comunicação",
  description: "Envia mensagem no chat com nome customizado",
  aiDescription: "Dedicated node for the chat_send game action.",
  kind: 'action',
  params: [
    {
      "key": "message",
      "label": "Mensagem"
    },
    {
      "key": "name",
      "label": "Nome",
      "placeholder": "[DSTP]"
    }
  ],
  defaults: { action_type: 'chat_send', params: {} },
  aiConfigExample: { action_type: 'chat_send', params: { message: 'Bem-vindo {{trigger.name}}!', name: '[DSTP]' } },
  outputSchema: {
    description: 'chat_send result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (chat_send)' },
    ],
  },
}
