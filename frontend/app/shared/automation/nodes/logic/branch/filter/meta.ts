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
  aiEnums: {
    operator: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains',
      'not_contains', 'starts_with', 'not_starts_with', 'ends_with', 'exists'],
  },
  aiConfigExample: { field: '{{player.admin}}', operator: 'equals', value: 'true' },
  aiConfigNote: 'field/operator/value are FLAT on data. Single output (no handles) — the flow halts when the check fails.',
  kind: 'logic',

  subgroup: 'Ramificação',
  // Same shape as condition: field / operator / value.
  defaults: { field: '', operator: 'equals', value: '' },
  outputSchema: {
    description: 'Filter result',
    fields: [
      { name: 'passed', type: 'boolean', description: 'Whether the flow was allowed to continue' },
    ],
  },
}
