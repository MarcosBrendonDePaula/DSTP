import type { NodeMeta } from '@shared/automation/nodeMeta'

// Capability QUERY (a primitive, no policy): how many of an item fit in an entity's
// container/inventory right now — free slots + room in stacks. The answer comes back
// as the `entity_capacity` event { token, count, is_full, num_items }; wire a trigger
// on it and decide in the flow (unload, drop, stop collecting…).
export const meta: NodeMeta = {
  type: 'entity_can_accept',
  label: '📏 Entidade: Cabe? (capacidade)',
  icon: '📏',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Pergunta quantos de um item cabem no container/inventário da entidade → evento entity_capacity.',
  aiDescription: 'Ask how many of an item (a world item by item_guid, or a fresh `item` prefab) fit in an entity\'s container/inventory now (free slots + stack room). Answer: entity_capacity { token, count, is_full, num_items }.',
  aiParamDescriptions: { guid: 'The entity.', item_guid: 'A world item GUID (e.g. {{trigger.item_guid}}).', item: 'Or a prefab name.', token: 'Echoed on entity_capacity to match the answer.' },
  kind: 'action',
  params: [
    { key: 'id', label: 'ID estável (sobrevive ao reload)', placeholder: '{{pet.id}}' },
    { key: 'guid', label: 'GUID da entidade', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab da entidade (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'item_guid', label: 'GUID do item', placeholder: '{{trigger.item_guid}}' },
    { key: 'item', label: 'ou prefab do item', placeholder: 'log' },
    { key: 'token', label: 'Token (evento entity_capacity)', placeholder: 'cap' },
  ],
  defaults: { action_type: 'entity_can_accept', params: { token: 'cap' } },
  outputSchema: { description: 'entity_can_accept result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (answer arrives as entity_capacity)' }] },
}
