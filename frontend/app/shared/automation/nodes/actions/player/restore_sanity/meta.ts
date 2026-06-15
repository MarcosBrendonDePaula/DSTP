import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `restore_sanity` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'restore_sanity',
  label: "🧠 Restore Sanity",
  icon: "🧠",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Jogador",
  description: "Restaura toda a sanidade do jogador",
  aiDescription: "Dedicated node for the restore_sanity game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "User ID",
      "placeholder": "{{trigger.userid}}"
    }
  ],
  defaults: { action_type: 'restore_sanity', params: {} },
  outputSchema: {
    description: 'restore_sanity result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (restore_sanity)' },
    ],
  },
}
