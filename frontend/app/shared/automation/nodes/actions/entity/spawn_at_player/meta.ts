import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `spawn_at_player` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'spawn_at_player',
  label: "🏗 Spawn at Player",
  icon: "🏗",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Cria prefab perto de um jogador",
  aiDescription: "Dedicated node for the spawn_at_player game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "prefab",
      "label": "Prefab",
      "placeholder": "skeleton"
    },
    {
      "key": "count",
      "label": "Qtd",
      "placeholder": "1"
    },
    {
      "key": "offset_x",
      "label": "Offset X",
      "placeholder": "0"
    },
    {
      "key": "offset_z",
      "label": "Offset Z",
      "placeholder": "0"
    }
  ],
  defaults: { action_type: 'spawn_at_player', params: {} },
  outputSchema: {
    description: 'spawn_at_player result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (spawn_at_player)' },
    ],
  },
}
