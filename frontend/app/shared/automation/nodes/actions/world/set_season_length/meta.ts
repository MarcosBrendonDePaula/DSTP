import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `set_season_length` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'set_season_length',
  label: "🍂 Duração da Estação",
  icon: "🍂",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Define a duração em dias de uma estação",
  aiDescription: "Dedicated node for the set_season_length game action.",
  kind: 'action',
  params: [
    {
      "key": "season",
      "label": "Estação",
      "placeholder": "autumn"
    },
    {
      "key": "length",
      "label": "Dias",
      "placeholder": "20"
    }
  ],
  defaults: { action_type: 'set_season_length', params: {} },
  outputSchema: {
    description: 'set_season_length result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (set_season_length)' },
    ],
  },
}
