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
      { name: 'prefab', type: 'string', description: 'Character prefab (e.g. wilson)' },
      { name: 'admin', type: 'boolean', description: 'Whether the player is a server admin' },
      // health/hunger/sanity are NESTED objects { current, max } (collectors.lua) —
      // read them as {{get_player.health.current}}, NOT {{get_player.health}}.
      { name: 'health', type: 'object', description: 'Health { current, max } — use {{...health.current}}' },
      { name: 'hunger', type: 'object', description: 'Hunger { current, max } — use {{...hunger.current}}' },
      { name: 'sanity', type: 'object', description: 'Sanity { current, max } — use {{...sanity.current}}' },
      { name: 'position', type: 'object', description: 'World position { x, z }' },
      { name: 'error', type: 'string', description: 'Set when the player was not found' },
    ],
  },
}
