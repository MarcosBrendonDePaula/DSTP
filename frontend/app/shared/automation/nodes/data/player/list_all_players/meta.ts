import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'list_all_players',
  label: "List Players",
  icon: "👥",
  color: '#14b8a6',
  accent: 'text-teal-400',
  category: 'Dados',
  subgroup: "Jogador",
  description: "Todos os jogadores online (array, para foreach).",
  aiDescription: "List all online players in this server as an array (use with foreach / broadcast).",
  kind: 'data',
  defaults: { params: {} },
  outputSchema: {
    description: "Todos os jogadores online (array, para foreach).",
    fields: [
      { name: 'players', type: 'object', description: "Array of player objects (userid, name, health...)" },
      { name: 'userids', type: 'object', description: "Array of userids" },
      { name: 'count', type: 'number', description: "Number of players online" },
    ],
  },
}
