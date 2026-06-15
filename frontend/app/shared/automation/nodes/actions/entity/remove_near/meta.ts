import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `remove_near` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'remove_near',
  label: "🗑 Remove Near (coords)",
  icon: "🗑",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Remove entidades de um prefab em coordenadas",
  aiDescription: "Dedicated node for the remove_near game action.",
  kind: 'action',
  params: [
    {
      "key": "prefab",
      "label": "Prefab"
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
      "key": "radius",
      "label": "Raio",
      "placeholder": "10"
    },
    {
      "key": "limit",
      "label": "Limite",
      "placeholder": "999"
    }
  ],
  defaults: { action_type: 'remove_near', params: {} },
  outputSchema: {
    description: 'remove_near result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (remove_near)' },
    ],
  },
}
