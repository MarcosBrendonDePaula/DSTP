import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `set_rain` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'set_rain',
  label: "🌧 Set Rain",
  icon: "🌧",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Mundo & Clima",
  description: "Liga ou desliga a chuva",
  aiDescription: "Dedicated node for the set_rain game action.",
  kind: 'action',
  params: [
    {
      "key": "enabled",
      "label": "Ativar",
      "placeholder": "true"
    }
  ],
  defaults: { action_type: 'set_rain', params: {} },
  outputSchema: {
    description: 'set_rain result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (set_rain)' },
    ],
  },
}
