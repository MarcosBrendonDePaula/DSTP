import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `set_phase` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'set_phase',
  label: "🌙 Set Phase",
  icon: "🌙",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Muda a fase do dia (dia/noite)",
  aiDescription: "Dedicated node for the set_phase game action.",
  kind: 'action',
  params: [
    {
      "key": "phase",
      "label": "Fase",
      "placeholder": "day"
    }
  ],
  defaults: { action_type: 'set_phase', params: {} },
  outputSchema: {
    description: 'set_phase result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (set_phase)' },
    ],
  },
}
