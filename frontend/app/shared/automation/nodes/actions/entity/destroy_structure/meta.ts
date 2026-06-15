import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `destroy_structure` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'destroy_structure',
  label: "🔨 Destroy Structure",
  icon: "🔨",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Destrói estrutura em coordenadas do mundo",
  aiDescription: "Dedicated node for the destroy_structure game action.",
  kind: 'action',
  params: [
    {
      "key": "x",
      "label": "X"
    },
    {
      "key": "z",
      "label": "Z"
    },
    {
      "key": "prefab",
      "label": "Prefab (opcional)"
    },
    {
      "key": "radius",
      "label": "Raio",
      "placeholder": "3"
    }
  ],
  defaults: { action_type: 'destroy_structure', params: {} },
  outputSchema: {
    description: 'destroy_structure result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (destroy_structure)' },
    ],
  },
}
