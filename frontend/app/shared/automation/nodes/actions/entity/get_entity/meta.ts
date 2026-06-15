import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `get_entity` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'get_entity',
  label: "🔎 Ler Entidade (por GUID)",
  icon: "🔎",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Lê dados de uma entidade não-jogador",
  aiDescription: "Dedicated node for the get_entity game action.",
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
      "placeholder": "beefalo"
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
      "key": "token",
      "label": "Token (correlação)",
      "placeholder": "{{trigger.callback}}"
    }
  ],
  defaults: { action_type: 'get_entity', params: {} },
  outputSchema: {
    description: 'get_entity result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (get_entity)' },
    ],
  },
}
