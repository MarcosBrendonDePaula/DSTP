import type { NodeMeta } from '@shared/automation/nodeMeta'

// Hand a mob's brain to the flow. The behaviour tree runs in-frame on the DST server
// (scripts/brains/dstp_flowbrain.lua); this node only writes the MODE + parameters the
// tree reads (dstp/flow_brain.lua). Target the mob by GUID (from a spawn_result / entity
// event) or by prefab near x/z. `default` gives the prefab its own brain back.
export const meta: NodeMeta = {
  type: 'entity_brain',
  label: '🧠 Entidade: Cérebro (modo)',
  icon: '🧠',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Entidades & Spawn',
  description: 'Controla o comportamento de um mob: seguir, guardar, atacar, fugir, vagar, parar.',
  aiDescription: 'Set a non-player mob\'s behaviour mode (the brain runs server-side; the flow only picks the mode and parameters): follow a player/entity, guard a point, attack by tags/prefabs, flee, wander, stay, or default (restore the original brain).',
  aiParamDescriptions: {
    guid: 'Entity GUID (from spawn_result.guid or an entity event).', prefab: 'Prefab to find near x/z when no GUID.',
    mode: 'follow | guard | attack | flee | wander | stay | default', target: 'follow: player userid (KU_...) or entity guid.',
    anchor_x: 'guard/wander: point X.', anchor_z: 'guard/wander: point Z.', brain_radius: 'guard/attack/flee/wander radius (default 12).',
    tags: 'attack/guard/flee: comma list of tags (e.g. hostile, monster).', prefabs: 'attack/guard: comma list of prefabs.',
    attack_players: 'true to let attack/guard target players.', token: 'Optional: a brain_result event echoes it with ok/reason.',
  },
  aiEnums: { 'params.mode': ['follow', 'guard', 'attack', 'flee', 'wander', 'stay', 'default'] },
  kind: 'action',
  params: [
    { key: 'id', label: 'ID estável (sobrevive ao reload)', placeholder: '{{pet.id}}' },
    { key: 'guid', label: 'GUID', placeholder: '{{spawn.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X (busca)', placeholder: '' },
    { key: 'z', label: 'Z (busca)', placeholder: '' },
    { key: 'radius', label: 'Raio da busca', placeholder: '8' },
    { key: 'mode', label: 'Modo (follow/guard/attack/flee/wander/stay/default)', placeholder: 'follow' },
    { key: 'target', label: 'Alvo a seguir (userid ou guid)', placeholder: '{{trigger.userid}}' },
    { key: 'anchor_x', label: 'Âncora X (guard/wander)', placeholder: '' },
    { key: 'anchor_z', label: 'Âncora Z (guard/wander)', placeholder: '' },
    { key: 'brain_radius', label: 'Raio de ação', placeholder: '12' },
    { key: 'tags', label: 'Tags alvo (vírgula)', placeholder: 'hostile, monster' },
    { key: 'prefabs', label: 'Prefabs alvo (vírgula)', placeholder: 'spider, hound' },
    { key: 'attack_players', label: 'Atacar jogadores (true/false)', placeholder: 'false' },
    { key: 'token', label: 'Token (evento brain_result)', placeholder: '' },
  ],
  defaults: { action_type: 'entity_set_brain', params: { mode: 'follow' } },
  outputSchema: {
    description: 'entity_brain result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (command queued)' },
      { name: 'action', type: 'string', description: 'entity_set_brain' },
    ],
  },
}
