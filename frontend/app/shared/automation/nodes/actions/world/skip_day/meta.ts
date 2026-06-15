import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `skip_day` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'skip_day',
  label: "⏭ Skip Days",
  icon: "⏭",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Pula N dias no calendário do mundo",
  aiDescription: "Dedicated node for the skip_day game action.",
  kind: 'action',
  params: [
    {
      "key": "days",
      "label": "Dias",
      "placeholder": "1"
    }
  ],
  defaults: { action_type: 'skip_day', params: {} },
  outputSchema: {
    description: 'skip_day result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (skip_day)' },
    ],
  },
}
