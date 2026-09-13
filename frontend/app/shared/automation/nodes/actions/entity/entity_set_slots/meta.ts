import type { NodeMeta } from '@shared/automation/nodeMeta'

// Grow ONE container's slots at runtime (chest, Chester, backpack, icebox…). The mod
// replicates the per-instance layout to every client and persists it. Only grows.
// Ack: entity_slots { guid, prefab, slots, ok, reason }.
export const meta: NodeMeta = {
  type: 'entity_set_slots',
  label: '🗄 Entidade: Slots do container',
  icon: '🗄',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Aumenta os slots de um baú/Chester/mochila em runtime (só cresce) → evento entity_slots.',
  aiDescription: 'Grow a container entity\'s slot count at runtime (only grows; replicated to clients and persisted). Target by guid or prefab near x/z. Ack entity_slots { ok, reason, slots }.',
  aiParamDescriptions: { guid: 'The container entity (a chest, the pet…).', slots: 'New slot count (e.g. 16, 25).', token: 'Echoed on entity_slots.' },
  kind: 'action',
  params: [
    { key: 'id', label: 'ID estável (sobrevive ao reload)', placeholder: '{{pet.id}}' },
    { key: 'guid', label: 'GUID do container', placeholder: '{{pet.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: 'treasurechest' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'slots', label: 'Slots', placeholder: '16' },
    { key: 'token', label: 'Token (evento entity_slots)', placeholder: '' },
  ],
  defaults: { action_type: 'entity_set_slots', params: { slots: '16' } },
  outputSchema: { description: 'entity_set_slots result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (ack arrives as entity_slots)' }] },
}
