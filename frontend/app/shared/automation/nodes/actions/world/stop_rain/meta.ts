import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `stop_rain` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'stop_rain',
  label: "☀ Stop Rain",
  icon: "☀",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Para a chuva e limpa o céu",
  aiDescription: "Dedicated node for the stop_rain game action.",
  kind: 'action',
  params: [],
  defaults: { action_type: 'stop_rain', params: {} },
  outputSchema: {
    description: 'stop_rain result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (stop_rain)' },
    ],
  },
}
