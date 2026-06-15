import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'teleport',
  label: '📍 Teleport',
  icon: '📍',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  description: 'Teleporta um jogador para coordenadas X/Z (use {{trigger.world_x}}/{{trigger.world_z}} para o mouse).',
  aiDescription: 'Teleport a player to world coords. params: userid, x, z. Pairs with key_pressed/key_combo world_x/world_z to tp to the cursor.',
  aiParamDescriptions: {
    userid: 'Klei user id of the player to move (e.g. {{trigger.userid}}).',
    x: 'World X coordinate (e.g. {{trigger.world_x}}).',
    z: 'World Z coordinate (e.g. {{trigger.world_z}}).',
  },
  kind: 'action',

  subgroup: 'Jogador',  // action_type is FIXED — the generic action handler reads it; the dedicated ui
  // renders the params without a type dropdown.
  defaults: { action_type: 'teleport', params: { userid: '{{trigger.userid}}', x: '', z: '' } },
  outputSchema: {
    description: 'Teleport result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true (the command was queued)' },
      { name: 'action', type: 'string', description: 'The action that ran (teleport)' },
    ],
  },
}
