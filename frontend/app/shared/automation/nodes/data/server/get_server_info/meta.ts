import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'get_server_info',
  label: "Get Server Info",
  icon: "🖥",
  color: '#14b8a6',
  accent: 'text-teal-400',
  category: 'Dados',
  subgroup: "Servidor",
  description: "Estado do servidor: dia, estação, fase, players, uptime.",
  aiDescription: "Read the current server state (day, season, phase, player count, uptime, time scale).",
  kind: 'data',
  defaults: { params: {} },
  outputSchema: {
    description: "Estado do servidor: dia, estação, fase, players, uptime.",
    fields: [
      { name: 'day', type: 'number', description: "Current day" },
      { name: 'season', type: 'string', description: "Current season" },
      { name: 'phase', type: 'string', description: "day / dusk / night" },
      { name: 'current_players', type: 'number', description: "Players online" },
      { name: 'max_players', type: 'number', description: "Max players" },
      { name: 'uptime', type: 'number', description: "Server uptime (s)" },
      { name: 'time_scale', type: 'number', description: "Game speed" },
      { name: 'name', type: 'string', description: "Server name" },
      { name: 'online', type: 'boolean', description: "Whether the server is online" },
      { name: 'error', type: 'string', description: "Set when the server is not known" },
    ],
  },
}
