import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `entity_freeze` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'entity_freeze',
  label: "🧊 Entidade: Congelar",
  icon: "🧊",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Congela uma entidade não-jogador",
  aiDescription: "Dedicated node for the entity_freeze game action.",
  kind: 'action',
  params: [
    {
      "key": "guid",
      "label": "GUID",
      "placeholder": "{{trigger.guid}}"
    },
    {
      "key": "prefab",
      "label": "Prefab (se sem GUID)",
      "placeholder": ""
    },
    {
      "key": "x",
      "label": "X",
      "placeholder": ""
    },
    {
      "key": "z",
      "label": "Z",
      "placeholder": ""
    },
    {
      "key": "radius",
      "label": "Raio",
      "placeholder": "8"
    },
    {
      "key": "coldness",
      "label": "Frio (intensidade)",
      "placeholder": "1"
    }
  ],
  defaults: { action_type: 'entity_freeze', params: {} },
  outputSchema: {
    description: 'entity_freeze result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (entity_freeze)' },
    ],
  },
}
