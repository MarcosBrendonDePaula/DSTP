import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `lightning` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'lightning',
  label: "⚡ Lightning no Player",
  icon: "⚡",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Jogador",
  description: "Cai um raio sobre o jogador",
  aiDescription: "Dedicated node for the lightning game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    }
  ],
  defaults: { action_type: 'lightning', params: {} },
  outputSchema: {
    description: 'lightning result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (lightning)' },
    ],
  },
}
