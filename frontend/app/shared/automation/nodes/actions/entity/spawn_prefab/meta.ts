import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `spawn_prefab` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'spawn_prefab',
  label: "🏗 Spawn (coords)",
  icon: "🏗",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Cria prefab em coordenadas do mundo",
  aiDescription: "Dedicated node for the spawn_prefab game action.",
  kind: 'action',
  params: [
    {
      "key": "prefab",
      "label": "Prefab",
      "placeholder": "skeleton"
    },
    {
      "key": "x",
      "label": "X"
    },
    {
      "key": "z",
      "label": "Z"
    },
    {
      "key": "count",
      "label": "Qtd",
      "placeholder": "1"
    }
  ],
  defaults: { action_type: 'spawn_prefab', params: {} },
  outputSchema: {
    description: 'spawn_prefab result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (spawn_prefab)' },
    ],
  },
}
