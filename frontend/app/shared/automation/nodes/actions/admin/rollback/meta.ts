import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `rollback` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'rollback',
  label: "↩ Rollback",
  icon: "↩",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Admin / Poder",
  description: "Reverte o mundo para um save anterior",
  aiDescription: "Dedicated node for the rollback game action.",
  kind: 'action',
  params: [
    {
      "key": "days",
      "label": "Dias",
      "placeholder": "0"
    }
  ],
  defaults: { action_type: 'rollback', params: {} },
  outputSchema: {
    description: 'rollback result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (rollback)' },
    ],
  },
}
