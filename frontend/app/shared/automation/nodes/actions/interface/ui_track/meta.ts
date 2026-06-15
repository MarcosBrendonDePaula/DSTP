import type { NodeMeta } from '@shared/automation/nodeMeta'

// Dedicated node for the `ui_track` game action. Its params live HERE (not in a
// central catalog). exec reuses the generic action handler — backend dispatch is by
// data.action_type, so no new server wiring.
export const meta: NodeMeta = {
  type: 'ui_track',
  label: "🎯 HUD sobre Entidade",
  icon: "🎯",
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: "Interface",
  description: "Cria HUD que segue uma entidade próxima",
  aiDescription: "Dedicated node for the ui_track game action.",
  kind: 'action',
  params: [
    {
      "key": "userid",
      "label": "Player",
      "placeholder": "{{trigger.userid}}"
    },
    {
      "key": "id",
      "label": "ID do widget",
      "placeholder": "boss_hp"
    },
    {
      "key": "prefab",
      "label": "Prefab alvo (vazio=mais próx.)",
      "placeholder": "deerclops"
    },
    {
      "key": "label",
      "label": "Texto",
      "placeholder": "Boss"
    },
    {
      "key": "max_dist",
      "label": "Distância máx.",
      "placeholder": "40"
    },
    {
      "key": "offset_y",
      "label": "Offset Y (acima)",
      "placeholder": "60"
    },
    {
      "key": "width",
      "label": "Largura",
      "placeholder": "80"
    },
    {
      "key": "color",
      "label": "Cor [r,g,b,a]",
      "placeholder": "[0.9,0.2,0.2,1]"
    }
  ],
  defaults: { action_type: 'ui_track', params: {} },
  outputSchema: {
    description: 'ui_track result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (ui_track)' },
    ],
  },
}
