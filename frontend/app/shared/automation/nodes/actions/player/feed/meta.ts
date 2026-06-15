import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `feed` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'feed',
  label: "🍖 Feed",
  icon: "🍖",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Jogador",
  description: "Restaura fome do jogador (ou enche tudo)",
  aiDescription: "Dedicated node for the feed game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "amount",
      "label": "Quantidade",
      "placeholder": "max"
    }
  ],
  defaults: { action_type: 'feed', params: {} },
  outputSchema: {
    description: 'feed result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (feed)' },
    ],
  },
}
