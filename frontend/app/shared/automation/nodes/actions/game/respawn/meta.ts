import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'respawn',
  label: '✨ Respawn',
  icon: '✨',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  description: 'Ressuscita um jogador (do estado fantasma).',
  aiDescription: 'Dedicated node for the respawn game action. params: userid.',
  kind: 'action',
  defaults: { action_type: 'respawn', params: {"userid":"{{trigger.userid}}"} },
  outputSchema: {
    description: 'respawn result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (respawn)' },
    ],
  },
}
