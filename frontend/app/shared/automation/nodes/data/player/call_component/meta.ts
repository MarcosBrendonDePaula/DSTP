import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'call_component',
  label: 'Call Component',
  icon: '⚙',
  color: '#ef4444',
  accent: 'text-red-400',
  category: 'Dados',
  description: 'Chama qualquer método de qualquer componente do player (poder total — admin).',
  aiDescription: 'Invoke any method of any DST component on a player (e.g. locomotor:SetExternalSpeedMultiplier). Use the "{{self}}" sentinel in args for the player entity. Admin-power — only use behind an admin check.',
  aiParamDescriptions: {
    userid: 'The player to mutate.',
    component: 'DST component name, e.g. locomotor, health, temperature.',
    method: 'Method to call, e.g. SetExternalSpeedMultiplier, SetMaxHealth.',
    args: 'JSON array of arguments. Use "{{self}}" for the player entity where the method wants `inst`.',
  },
  kind: 'data',
  defaults: { params: { userid: '{{trigger.userid}}', component: 'locomotor', method: '', args: '[]' } },
  outputSchema: {
    description: 'Component call queued',
    fields: [
      { name: 'called', type: 'boolean', description: 'Whether the call was queued' },
      { name: 'component', type: 'string', description: 'The component name' },
      { name: 'method', type: 'string', description: 'The method called' },
    ],
  },
}
