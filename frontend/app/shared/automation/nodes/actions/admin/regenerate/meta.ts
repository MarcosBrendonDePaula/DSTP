import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `regenerate` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'regenerate',
  label: "🌍 Regenerate World",
  icon: "🌍",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Admin / Poder",
  description: "Regenera o mundo do zero",
  aiDescription: "Dedicated node for the regenerate game action.",
  kind: 'action',
  params: [],
  defaults: { action_type: 'regenerate', params: {} },
  outputSchema: {
    description: 'regenerate result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (regenerate)' },
    ],
  },
}
