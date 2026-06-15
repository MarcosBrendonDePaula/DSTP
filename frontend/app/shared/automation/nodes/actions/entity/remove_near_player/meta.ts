import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `remove_near_player` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'remove_near_player',
  label: "🗑 Remove Near Player",
  icon: "🗑",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Entidades & Spawn",
  description: "Remove entidades de um prefab perto do jogador",
  aiDescription: "Dedicated node for the remove_near_player game action.",
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
  defaults: { action_type: 'remove_near_player', params: {} },
  outputSchema: {
    description: 'remove_near_player result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (remove_near_player)' },
    ],
  },
}
