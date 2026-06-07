import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'heal',
  label: '❤ Heal',
  icon: '❤',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  description: 'Cura um jogador (amount ou "max").',
  aiDescription: 'Dedicated node for the heal game action. params: userid, amount.',
  kind: 'action',
  defaults: { action_type: 'heal', params: {"userid":"{{trigger.userid}}","amount":"max"} },
  outputSchema: {
    description: 'heal result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (heal)' },
    ],
  },
}
