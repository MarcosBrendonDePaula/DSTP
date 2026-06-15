import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `godmode` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'godmode',
  label: "🛡 Godmode",
  icon: "🛡",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Jogador",
  description: "Liga ou desliga invencibilidade do jogador",
  aiDescription: "Dedicated node for the godmode game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "enabled",
      "label": "Ativar",
      "placeholder": "true"
    }
  ],
  defaults: { action_type: 'godmode', params: {} },
  outputSchema: {
    description: 'godmode result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (godmode)' },
    ],
  },
}
