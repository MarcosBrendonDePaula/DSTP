import type { NodeMeta } from '@shared/automation/nodeMeta'

// One-shot "go get THAT item" for ANY mob the flow controls (any mode; a mob without a
// flow brain gets one in `stay`). The mob walks to the item and takes it (or, with
// store=event, only reports arrival). Outcome: brain_task_done { kind: pickup, ok,
// reason, token, item, item_guid, count }. Primitive — what happens next is the flow's.
export const meta: NodeMeta = {
  type: 'entity_collect',
  label: '🧺 Entidade: Ir buscar item',
  icon: '🧺',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Manda um mob ir até um item (guid ou prefab mais próximo) e guardá-lo → evento brain_task_done.',
  aiDescription: 'Send a mob to a ground item (item_guid, or the nearest `item` prefab within brain_radius) and take it into its container/inventory (store=event: only report arrival). Answer: brain_task_done { kind: "pickup", ok, reason, token, item, item_guid, count }.',
  aiParamDescriptions: { guid: 'The mob.', item_guid: 'World item GUID.', item: 'Or a prefab: nearest within brain_radius.', store: 'self (take it) | event (only report).', timeout: 'Seconds before giving up (20).', token: 'Echoed on brain_task_done.' },
  kind: 'action',
  params: [
    { key: 'guid', label: 'GUID do mob', placeholder: '{{pet.guid}}' },
    { key: 'prefab', label: 'Prefab do mob (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca do mob)', placeholder: '' },
    { key: 'z', label: 'Z (busca do mob)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca do mob', placeholder: '8' },
    { key: 'item_guid', label: 'GUID do item', placeholder: '{{trigger.item_guid}}' },
    { key: 'item', label: 'ou prefab do item (mais próximo)', placeholder: 'log' },
    { key: 'brain_radius', label: 'Raio para achar o item', placeholder: '8' },
    { key: 'store', label: 'store (self | event)', placeholder: 'self' },
    { key: 'timeout', label: 'Timeout (s)', placeholder: '20' },
    { key: 'token', label: 'Token (evento brain_task_done)', placeholder: 'pick' },
  ],
  defaults: { action_type: 'entity_collect', params: { store: 'self', token: 'pick' } },
  outputSchema: { description: 'entity_collect result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (outcome arrives as brain_task_done)' }] },
}
