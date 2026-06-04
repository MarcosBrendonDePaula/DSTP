import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'get_player',
  label: 'Get Player',
  icon: '👤',
  color: '#14b8a6',
  accent: 'text-teal-400',
  category: 'Dados',
  description: 'Busca dados de um jogador por userid.',
  aiDescription: 'Look up a player by their userid and return their stats (health, hunger, sanity, position, inventory, admin...).',
  aiParamDescriptions: { userid: 'The Klei user id (KU_xxx) of the player to fetch.' },
  kind: 'data',
  defaults: { params: { userid: '' } },
  outputSchema: {
    description: 'Player data, or { error } if not found',
    fields: [
      { name: 'userid', type: 'string', description: 'Klei user id' },
      { name: 'name', type: 'string', description: 'Display name' },
      { name: 'health', type: 'number', description: 'Current health' },
      { name: 'hunger', type: 'number', description: 'Current hunger' },
      { name: 'sanity', type: 'number', description: 'Current sanity' },
      { name: 'admin', type: 'boolean', description: 'Whether the player is a server admin' },
      { name: 'error', type: 'string', description: 'Set when the player was not found' },
    ],
  },
}
