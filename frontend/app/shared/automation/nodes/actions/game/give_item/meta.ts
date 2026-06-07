import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'give_item',
  label: '🎁 Give Item',
  icon: '🎁',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  description: 'Dá um item a um jogador.',
  aiDescription: 'Dedicated node for the give_item game action. params: userid, prefab, count.',
  kind: 'action',
  defaults: { action_type: 'give_item', params: {"userid":"{{trigger.userid}}","prefab":"log","count":"1"} },
  outputSchema: {
    description: 'give_item result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (give_item)' },
    ],
  },
}
