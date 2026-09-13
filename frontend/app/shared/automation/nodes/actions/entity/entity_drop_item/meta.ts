import type { NodeMeta } from '@shared/automation/nodeMeta'

// Generic "drop from that entity": a prefab, an item guid, or everything, out of the
// entity's container or inventory onto the ground. Ack: item_dropped (with token).
export const meta: NodeMeta = {
  type: 'entity_drop_item',
  label: '📤 Entidade: Soltar item',
  icon: '📤',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Solta no chão um item (prefab, guid ou "all") do container/inventário de uma entidade.',
  aiDescription: 'Drop an item (prefab name, item guid, or "all") from an entity\'s container or inventory onto the ground.',
  aiParamDescriptions: { guid: 'The entity.', item: 'Prefab name, item guid, or "all".', token: 'Optional: item_dropped echoes it.' },
  kind: 'action',
  params: [
    { key: 'guid', label: 'GUID da entidade', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'item', label: 'Item (prefab, guid ou all)', placeholder: 'all' },
    { key: 'token', label: 'Token (evento item_dropped)', placeholder: '' },
  ],
  defaults: { action_type: 'entity_drop_item', params: { item: 'all' } },
  outputSchema: { description: 'entity_drop_item result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (command queued)' }] },
}
