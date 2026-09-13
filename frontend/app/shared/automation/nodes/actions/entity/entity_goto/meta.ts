import type { NodeMeta } from '@shared/automation/nodeMeta'

// One-shot "go there" for ANY mob the flow controls: walk to a point (x,z) or to an
// entity (target_guid). Outcome: brain_task_done { kind: goto, ok, reason, token }.
export const meta: NodeMeta = {
  type: 'entity_goto',
  label: '🚶 Entidade: Ir até',
  icon: '🚶',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Manda um mob andar até um ponto (x,z) ou até uma entidade → evento brain_task_done.',
  aiDescription: 'Send a mob to a point (goto_x/goto_z) or to an entity (target_guid). Answer: brain_task_done { kind: "goto", ok, reason, token }. The mob resumes its mode afterwards.',
  aiParamDescriptions: { guid: 'The mob.', target_guid: 'Entity to walk to (a player, a chest…).', goto_x: 'Or a point X.', goto_z: 'Point Z.', timeout: 'Seconds before giving up (20).', token: 'Echoed on brain_task_done.' },
  kind: 'action',
  params: [
    { key: 'guid', label: 'GUID do mob', placeholder: '{{pet.guid}}' },
    { key: 'prefab', label: 'Prefab do mob (se sem GUID)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca do mob', placeholder: '8' },
    { key: 'target_guid', label: 'GUID do destino (entidade)', placeholder: '{{chest.guid}}' },
    { key: 'goto_x', label: 'ou X do ponto', placeholder: '' },
    { key: 'goto_z', label: 'Z do ponto', placeholder: '' },
    { key: 'timeout', label: 'Timeout (s)', placeholder: '20' },
    { key: 'token', label: 'Token (evento brain_task_done)', placeholder: 'go' },
  ],
  defaults: { action_type: 'entity_goto', params: { token: 'go' } },
  outputSchema: { description: 'entity_goto result', fields: [{ name: 'executed', type: 'boolean', description: 'Always true (outcome arrives as brain_task_done)' }] },
}
