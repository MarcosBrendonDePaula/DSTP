import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'kill',
  label: '💀 Kill',
  icon: '💀',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  description: 'Mata um jogador.',
  aiDescription: 'Dedicated node for the kill game action. params: userid.',
  kind: 'action',

  subgroup: 'Jogador',
  defaults: { action_type: 'kill', params: {"userid":"{{trigger.userid}}"} },
  outputSchema: {
    description: 'kill result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (kill)' },
    ],
  },
}
