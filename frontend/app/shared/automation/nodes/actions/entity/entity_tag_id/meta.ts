import type { NodeMeta } from '@shared/automation/nodeMeta'

// Give an entity a STABLE id (or read the one it has). DST guids are reassigned on every
// world load, so a flow must not remember an entity by guid; the `dstp_id` is saved
// with the entity and re-indexed on load, and every entity_* node accepts `id` as the
// target. Answer: entity_id { token, ok, guid, prefab, id }.
export const meta: NodeMeta = {
  type: 'entity_tag_id',
  label: '🏷 Entidade: ID estável',
  icon: '🏷',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Dá um id estável à entidade (sobrevive ao reload; o GUID não) → evento entity_id.',
  aiDescription: 'Assign (or read) a stable id for an entity — guids change on every world load, this id does not. Remember THIS in memory. Answer: entity_id { token, ok, guid, prefab, id }. spawn_result and brain events already carry `id`.',
  aiParamDescriptions: { guid: 'The entity (guid, or prefab near x/z).', token: 'Echoed on entity_id.' },
  kind: 'action',
  params: [
    { key: 'id', label: 'ID estável (sobrevive ao reload)', placeholder: '{{pet.id}}' },
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'token', label: 'Token (evento entity_id)', placeholder: 'tag' },
  ],
  defaults: { action_type: 'entity_tag_id', params: { token: 'tag' } },
  outputSchema: { description: 'entity_tag_id result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (answer arrives as entity_id)' }] },
}
