import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `set_next_phase` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'set_next_phase',
  label: "⏭ Próxima Fase",
  icon: "⏭",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Avança para a próxima fase do dia",
  aiDescription: "Dedicated node for the set_next_phase game action.",
  kind: 'action',
  params: [],
  defaults: { action_type: 'set_next_phase', params: {} },
  outputSchema: {
    description: 'set_next_phase result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (set_next_phase)' },
    ],
  },
}
