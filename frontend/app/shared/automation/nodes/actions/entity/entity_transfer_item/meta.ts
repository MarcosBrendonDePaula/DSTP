import type { NodeMeta } from '@shared/automation/nodeMeta'

// Move items between two entities' containers/inventories without touching the
// ground (chest → chest, Chester → chest, mob → player). Ack: entity_item_transferred.
export const meta: NodeMeta = {
  type: 'entity_transfer_item',
  label: '🔁 Entidade: Transferir item',
  icon: '🔁',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Move um item (prefab, guid ou "all") do container/inventário de uma entidade para o de outra, sem passar pelo chão.',
  aiDescription: 'Move `item` (prefab | item guid | "all") from this entity\'s container/inventory into target_guid\'s. What the target refuses goes back. Ack entity_item_transferred { moved, refused }.',
  aiParamDescriptions: { guid: 'Source entity.', target_guid: 'Destination entity GUID (a player works too).', item: 'Prefab name, item guid, or "all".', token: 'Optional ack token.' },
  kind: 'action',
  params: [
    { key: 'guid', label: 'GUID da origem', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab da origem (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'target_guid', label: 'GUID do destino', placeholder: '{{chest.guid}}' },
    { key: 'item', label: 'Item (prefab, guid ou all)', placeholder: 'all' },
    { key: 'token', label: 'Token (evento entity_item_transferred)', placeholder: '' },
  ],
  defaults: { action_type: 'entity_transfer_item', params: { item: 'all' } },
  outputSchema: { description: 'entity_transfer_item result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (command queued)' }] },
}
