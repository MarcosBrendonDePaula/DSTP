import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `set_day_length` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'set_day_length',
  label: "🕐 Duração do Ciclo",
  icon: "🕐",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Define a duração de dia, anoitecer e noite",
  aiDescription: "Dedicated node for the set_day_length game action.",
  kind: 'action',
  params: [
    {
      "key": "day",
      "label": "Dia (segs)",
      "placeholder": "10"
    },
    {
      "key": "dusk",
      "label": "Anoitecer (segs)",
      "placeholder": "4"
    },
    {
      "key": "night",
      "label": "Noite (segs)",
      "placeholder": "8"
    }
  ],
  defaults: { action_type: 'set_day_length', params: {} },
  outputSchema: {
    description: 'set_day_length result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (set_day_length)' },
    ],
  },
}
