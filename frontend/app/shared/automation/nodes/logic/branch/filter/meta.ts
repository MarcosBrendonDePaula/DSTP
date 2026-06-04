import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'filter',
  label: 'Filter',
  icon: '⛔',
  color: '#eab308',
  accent: 'text-yellow-400',
  category: 'Logica',
  description: 'Para o fluxo se a condição não passar (sem ramificar).',
  aiDescription: 'Stop the flow unless a condition passes. Unlike condition (which branches), filter has a single output and simply halts when the check fails.',
  kind: 'logic',
  // Same shape as condition: field / operator / value.
  defaults: { field: '', operator: 'equals', value: '' },
  outputSchema: {
    description: 'Filter result',
    fields: [
      { name: 'passed', type: 'boolean', description: 'Whether the flow was allowed to continue' },
    ],
  },
}
