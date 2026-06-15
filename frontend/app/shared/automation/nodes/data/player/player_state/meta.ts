import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'player_state',
  label: 'Player State',
  icon: '🌡',
  color: '#14b8a6',
  accent: 'text-teal-400',
  category: 'Dados',
  description: 'Controla o estado físico/vital de um player (temperatura, fogo, vida, velocidade...).',
  aiDescription: 'Set a player\'s real state: temperature, moisture, fire (ignite/extinguish), freeze/unfreeze, movement speed, health/hunger/sanity (by percent or value), max health, or position.',
  aiParamDescriptions: {
    userid: 'The player to affect.',
    attribute: 'temperature | moisture | fire | freeze | speed | health | hunger | sanity | max_health | position',
    mode: 'For vitals: "percent" (0..1) or "value" (exact). For fire/freeze: "on"/"off".',
    value: 'The value to apply (number; for vitals depends on mode).',
  },
  kind: 'data',

  subgroup: 'Jogador',
  defaults: { params: { userid: '{{trigger.userid}}', attribute: 'temperature', mode: 'set', value: '' } },
  outputSchema: {
    description: 'Player state applied',
    fields: [
      { name: 'applied', type: 'boolean', description: 'Always true (the command was queued)' },
      { name: 'attribute', type: 'string', description: 'Which attribute was set' },
    ],
  },
}
