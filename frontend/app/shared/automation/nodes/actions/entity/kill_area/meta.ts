import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `kill_area` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'kill_area',
  label: "☠ Matar em Área (volta do player)",
  icon: "☠",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Mata mobs em volta de um jogador",
  aiDescription: "Dedicated node for the kill_area game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player (userid)",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "radius",
      "label": "Raio",
      "placeholder": "15"
    },
    {
      "key": "filter",
      "label": "Filtro: mobs / hostile / prefab / all",
      "placeholder": "mobs"
    },
    {
      "key": "prefab",
      "label": "Prefab (se filter=prefab)",
      "placeholder": "spider"
    },
    {
      "key": "limit",
      "label": "Limite",
      "placeholder": "200"
    }
  ],
  defaults: { action_type: 'kill_area', params: {} },
  outputSchema: {
    description: 'kill_area result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (kill_area)' },
    ],
  },
}
