import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'delay',
  label: 'Delay',
  icon: '⏱',
  color: '#a855f7',
  accent: 'text-gray-400',
  category: 'Logica',
  description: 'Pausa a execucao por um tempo.',
  aiDescription: 'Pause the flow for a number of milliseconds before continuing.',
  aiParamDescriptions: { delay_ms: 'How long to wait, in milliseconds (max 1h).' },
  kind: 'logic',

  subgroup: 'Temporização',
  defaults: { params: { delay_ms: '1000' } },
  outputSchema: {
    description: 'Delay completed',
    fields: [
      { name: 'delayed', type: 'boolean', description: 'Always true once the wait finished' },
      { name: 'ms', type: 'number', description: 'Milliseconds actually waited (clamped 0..1h)' },
    ],
  },
}
