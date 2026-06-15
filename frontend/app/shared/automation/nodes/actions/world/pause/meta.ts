import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `pause` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'pause',
  label: "⏸ Pause",
  icon: "⏸",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Pausa a simulação do servidor",
  aiDescription: "Dedicated node for the pause game action.",
  kind: 'action',
  params: [],
  defaults: { action_type: 'pause', params: {} },
  outputSchema: {
    description: 'pause result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (pause)' },
    ],
  },
}
