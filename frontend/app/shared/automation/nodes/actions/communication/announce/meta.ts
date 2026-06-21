import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `announce` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'announce',
  label: "📢 Announce",
  icon: "📢",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Comunicação",
  description: "Envia anúncio global no topo da tela",
  aiDescription: "Dedicated node for the announce game action.",
  kind: 'action',
  params: [
    {
      "key": "message",
      "label": "Mensagem",
      "placeholder": "Texto do anúncio"
    }
  ],
  defaults: { action_type: 'announce', params: {} },
  aiConfigExample: { action_type: 'announce', params: { message: '{{trigger.name}} entrou no servidor!' } },
  outputSchema: {
    description: 'announce result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (announce)' },
    ],
  },
}
