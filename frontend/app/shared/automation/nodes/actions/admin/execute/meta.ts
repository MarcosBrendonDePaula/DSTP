import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `execute` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'execute',
  label: "🔧 Execute Lua",
  icon: "🔧",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Admin / Poder",
  description: "Roda código Lua arbitrário no servidor (perigoso)",
  aiDescription: "Dedicated node for the execute game action.",
  kind: 'action',
  params: [
    {
      "key": "lua",
      "label": "Código Lua",
      "placeholder": "print(\"hello\")"
    }
  ],
  defaults: { action_type: 'execute', params: {} },
  outputSchema: {
    description: 'execute result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (execute)' },
    ],
  },
}
