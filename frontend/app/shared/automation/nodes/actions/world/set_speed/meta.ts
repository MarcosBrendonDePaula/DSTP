import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `set_speed` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'set_speed',
  label: "⏩ Set Speed",
  icon: "⏩",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Ajusta a velocidade global do tempo",
  aiDescription: "Dedicated node for the set_speed game action.",
  kind: 'action',
  params: [
    {
      "key": "speed",
      "label": "Velocidade",
      "placeholder": "1"
    }
  ],
  defaults: { action_type: 'set_speed', params: {} },
  outputSchema: {
    description: 'set_speed result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (set_speed)' },
    ],
  },
}
