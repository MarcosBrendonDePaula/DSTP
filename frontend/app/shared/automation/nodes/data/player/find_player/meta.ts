import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'find_player',
  label: 'Find Player',
  icon: '⌕',
  color: '#14b8a6',
  accent: 'text-teal-400',
  category: 'Dados',
  description: 'Localiza jogador por nome.',
  aiDescription: 'Find a player by (partial) name, case-insensitive. Strips command prefixes like "#tp ". Returns the player data or { error }.',
  aiParamDescriptions: { name: 'Full or partial player name to search for.' },
  kind: 'data',
  defaults: { params: { name: '' } },
  outputSchema: {
    description: 'Matched player data (same shape as get_player), or { error } if not found',
    fields: [
      { name: 'userid', type: 'string', description: 'Klei user id' },
      { name: 'name', type: 'string', description: 'Display name' },
      { name: 'prefab', type: 'string', description: 'Character prefab (e.g. wilson)' },
      { name: 'admin', type: 'boolean', description: 'Whether the player is a server admin' },
      { name: 'health', type: 'object', description: 'Health { current, max } — use {{...health.current}}' },
      { name: 'hunger', type: 'object', description: 'Hunger { current, max } — use {{...hunger.current}}' },
      { name: 'sanity', type: 'object', description: 'Sanity { current, max } — use {{...sanity.current}}' },
      { name: 'position', type: 'object', description: 'World position { x, z }' },
      { name: 'error', type: 'string', description: 'Set when no player matched' },
    ],
  },
}
