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
  description: "HUD que segue entidades: uma (prefab/alvo de combate) ou TODAS num raio (modo all). Ligue nós ui_* como filhos para desenhar o template por entidade; use `bind` neles (ex.: value=entity.hp) para o cliente atualizar sozinho.",
  aiDescription: "HUD widget following world entities. mode='all' tracks every entity in `radius` matching `prefabs`/`tags` (one follower each, created/destroyed client-side as they enter/leave); other modes follow one target (prefab / nearest / combat_target). ui_* children wired under this node become the per-entity template; their `bind` props (e.g. value=entity.hp, max=entity.hp_max, text=entity.name) are re-evaluated locally every frame. Set require_hp=true to skip entities without the HP netvar.",
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
      "key": "mode",
      "label": "Modo (all | prefab | combat_target | vazio=mais próx.)",
      "placeholder": "all"
    },
    {
      "key": "prefabs",
      "label": "Prefabs (modo all, lista)",
      "placeholder": "spider, hound, deerclops"
    },
    {
      "key": "tags",
      "label": "Tags (modo all, qualquer uma)",
      "placeholder": "monster, hostile"
    },
    {
      "key": "radius",
      "label": "Raio (modo all)",
      "placeholder": "30"
    },
    {
      "key": "require_hp",
      "label": "Só entidades com HP replicado (true/false)",
      "placeholder": "true"
    },
    {
      "key": "prefab",
      "label": "Prefab alvo (modo único; vazio=mais próx.)",
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
