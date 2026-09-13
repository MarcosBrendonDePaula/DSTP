import type { NodeMeta } from '@shared/automation/nodeMeta'

// Spawn an item straight into ANY entity's container/inventory (a chest, a Chester, a
// pigman) — the entity counterpart of the player's give_item. Ack: item_given.
export const meta: NodeMeta = {
  type: 'entity_give_item',
  label: '🎁 Entidade: Dar item',
  icon: '🎁',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Cria um item (prefab × qtd) direto no container/inventário de uma entidade.',
  aiDescription: 'Spawn `item` ×count directly into an entity\'s container or inventory (chest, Chester, mob). Target by guid or prefab near x/z. Ack item_given { ok, reason, item_guid }.',
  aiParamDescriptions: { guid: 'The entity that receives.', item: 'Item prefab (e.g. log, meat).', count: 'Stack size (default 1).', token: 'Optional: item_given echoes it.' },
  kind: 'action',
  params: [
    { key: 'guid', label: 'GUID da entidade', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab da entidade (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'item', label: 'Item (prefab)', placeholder: 'log' },
    { key: 'count', label: 'Quantidade', placeholder: '1' },
    { key: 'token', label: 'Token (evento item_given)', placeholder: '' },
  ],
  defaults: { action_type: 'entity_give_item', params: { count: '1' } },
  outputSchema: { description: 'entity_give_item result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (command queued)' }] },
}
