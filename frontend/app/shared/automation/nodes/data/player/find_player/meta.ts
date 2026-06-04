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
    description: 'Matched player data, or { error } if not found',
    fields: [
      { name: 'userid', type: 'string', description: 'Klei user id' },
      { name: 'name', type: 'string', description: 'Display name' },
      { name: 'error', type: 'string', description: 'Set when no player matched' },
    ],
  },
}
