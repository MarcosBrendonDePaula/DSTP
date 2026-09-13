import type { NodeMeta } from '@shared/automation/nodeMeta'

// Generic "put this world item into that entity": the entity's container (Chester,
// chest) or inventory (a pigman). The flow half of the event-driven collect —
// entity_brain collect with store=event reports brain_item_reached, the flow
// decides, this node takes it. Ack: item_taken { token, ok, reason } (with token).
export const meta: NodeMeta = {
  type: 'entity_take_item',
  label: '📥 Entidade: Guardar item',
  icon: '📥',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Coloca um item do chão (item_guid) no container ou inventário de uma entidade.',
  aiDescription: 'Put a world item (by item_guid, e.g. from brain_item_reached) into an entity\'s container or inventory. Target the entity by guid or prefab near x/z.',
  aiParamDescriptions: { guid: 'Entity that takes the item.', item_guid: 'The item entity GUID ({{trigger.item_guid}}).', token: 'Optional: item_taken echoes it with ok/reason.' },
  kind: 'action',
  params: [
    { key: 'guid', label: 'GUID da entidade', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'item_guid', label: 'GUID do item', placeholder: '{{trigger.item_guid}}' },
    { key: 'token', label: 'Token (evento item_taken)', placeholder: '' },
  ],
  defaults: { action_type: 'entity_take_item', params: { item_guid: '{{trigger.item_guid}}' } },
  outputSchema: { description: 'entity_take_item result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (command queued)' }] },
}
