import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'kick',
  label: '🚫 Kick',
  icon: '🚫',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  description: 'Expulsa um jogador do servidor.',
  aiDescription: 'Dedicated node for the kick game action. params: userid.',
  kind: 'action',
  defaults: { action_type: 'kick', params: {"userid":"{{trigger.userid}}"} },
  outputSchema: {
    description: 'kick result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (kick)' },
    ],
  },
}
