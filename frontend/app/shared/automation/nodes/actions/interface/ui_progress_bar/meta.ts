import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `ui_progress_bar` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'ui_progress_bar',
  label: "📊 Barra",
  icon: "📊",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Interface",
  description: "Cria barra de progresso no HUD do jogador",
  aiDescription: "Dedicated node for the ui_progress_bar game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "id",
      "label": "ID",
      "placeholder": "minha_barra"
    },
    {
      "key": "value",
      "label": "Valor (0-1)",
      "placeholder": "{{jogador.health.current}}"
    },
    {
      "key": "max",
      "label": "Max",
      "placeholder": "{{jogador.health.max}}"
    },
    {
      "key": "label",
      "label": "Label",
      "placeholder": "HP"
    },
    {
      "key": "width",
      "label": "Largura",
      "placeholder": "200"
    }
  ],
  defaults: { action_type: 'ui_progress_bar', params: {} },
  outputSchema: {
    description: 'ui_progress_bar result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (ui_progress_bar)' },
    ],
  },
}
