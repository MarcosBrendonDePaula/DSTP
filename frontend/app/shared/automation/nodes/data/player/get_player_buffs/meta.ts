import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'get_player_buffs',
  label: "Get Buffs",
  icon: "✨",
  color: '#14b8a6',
  accent: 'text-teal-400',
  category: 'Dados',
  subgroup: "Jogador",
  description: "Estado físico: umidade, temperatura, fantasma, combate.",
  aiDescription: "Read a player's physical state (moisture, temperature, ghost/beaver, mightiness, starving, combat) by userid.",
  kind: 'data',
  defaults: { params: { userid: '' } },
  outputSchema: {
    description: "Estado físico: umidade, temperatura, fantasma, combate.",
    fields: [
      { name: 'moisture', type: 'number', description: "Wetness" },
      { name: 'temperature', type: 'number', description: "Body temperature" },
      { name: 'is_ghost', type: 'boolean', description: "Whether the player is a ghost" },
      { name: 'is_beaver', type: 'boolean', description: "Woodie beaver form" },
      { name: 'mightiness', type: 'number', description: "Wolfgang mightiness %" },
      { name: 'is_starving', type: 'boolean', description: "Starving state" },
      { name: 'in_combat', type: 'boolean', description: "Whether in combat" },
      { name: 'combat_target', type: 'string', description: "Current combat target" },
      { name: 'error', type: 'string', description: "Set when player not found" },
    ],
  },
}
