import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `unpause` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'unpause',
  label: "▶ Unpause",
  icon: "▶",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Retoma a simulação do servidor pausado",
  aiDescription: "Dedicated node for the unpause game action.",
  kind: 'action',
  params: [],
  defaults: { action_type: 'unpause', params: {} },
  outputSchema: {
    description: 'unpause result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (unpause)' },
    ],
  },
}
