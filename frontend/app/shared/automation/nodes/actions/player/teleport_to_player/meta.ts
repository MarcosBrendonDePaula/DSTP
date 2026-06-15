import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `teleport_to_player` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'teleport_to_player',
  label: "📍 Teleport to Player",
  icon: "📍",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Jogador",
  description: "Teleporta um jogador até outro jogador",
  aiDescription: "Dedicated node for the teleport_to_player game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Quem TP",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "target_userid",
      "label": "Destino",
      "placeholder": "{{resolver.target_userid}}"
    }
  ],
  defaults: { action_type: 'teleport_to_player', params: {} },
  outputSchema: {
    description: 'teleport_to_player result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (teleport_to_player)' },
    ],
  },
}
