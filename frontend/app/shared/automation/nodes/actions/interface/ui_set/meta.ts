import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `ui_set` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'ui_set',
  label: "🔧 Atualizar UI (prop)",
  icon: "🔧",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Interface",
  description: "Atualiza uma propriedade de um widget existente",
  aiDescription: "Dedicated node for the ui_set game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "id",
      "label": "ID da UI",
      "placeholder": "loja"
    },
    {
      "key": "node",
      "label": "Node ID",
      "placeholder": "saldo_txt"
    },
    {
      "key": "text",
      "label": "Texto",
      "placeholder": "Suas moedas: {{x}}"
    },
    {
      "key": "value",
      "label": "Valor (barra)",
      "placeholder": ""
    },
    {
      "key": "visible",
      "label": "Visível (true/false)",
      "placeholder": ""
    },
    {
      "key": "props",
      "label": "Props JSON (avançado)",
      "placeholder": "{\"color\":[1,0,0,1]}"
    }
  ],
  defaults: { action_type: 'ui_set', params: {} },
  outputSchema: {
    description: 'ui_set result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (ui_set)' },
    ],
  },
}
