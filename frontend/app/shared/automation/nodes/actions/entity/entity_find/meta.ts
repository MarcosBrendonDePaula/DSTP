import type { NodeMeta } from '@shared/automation/nodeMeta'

// QUERY: which entities of a prefab exist right now — optionally only the ones whose
// flow brain belongs to a player, within a radius of a player or point. Answer comes as
// the `entity_found` event { token, count, guid (nearest), entities[] }. Guids change on
// every world load, so a flow should ask THIS instead of trusting a remembered guid.
export const meta: NodeMeta = {
  type: 'entity_find',
  label: '🔍 Entidade: Procurar',
  icon: '🔍',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Procura entidades por prefab (opcional: só as com cérebro de um jogador, num raio) → evento entity_found.',
  aiDescription: 'Find entities by prefab (comma list), optionally only those whose flow brain targets owner_userid, optionally within radius of near_userid or x/z. Answer: entity_found { token, count, guid (nearest), entities[{guid,prefab,x,z,dist,mode}] }.',
  aiParamDescriptions: { prefab: 'Prefab name(s), comma separated.', owner_userid: 'Only entities whose flow brain follows this player.', near_userid: 'Measure distance from this player.', radius: 'Max distance (empty = anywhere).', token: 'Echoed on entity_found.' },
  kind: 'action',
  params: [
    { key: 'prefab', label: 'Prefab(s)', placeholder: 'chester' },
    { key: 'owner_userid', label: 'Dono do cérebro (userid, opcional)', placeholder: '{{trigger.userid}}' },
    { key: 'near_userid', label: 'Perto do jogador (userid, opcional)', placeholder: '' },
    { key: 'x', label: 'ou X do ponto', placeholder: '' },
    { key: 'z', label: 'Z do ponto', placeholder: '' },
    { key: 'radius', label: 'Raio (vazio = qualquer)', placeholder: '' },
    { key: 'token', label: 'Token (evento entity_found)', placeholder: 'find' },
  ],
  defaults: { action_type: 'entity_find', params: { prefab: 'chester', token: 'find' } },
  outputSchema: { description: 'entity_find result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (answer arrives as entity_found)' }] },
}
