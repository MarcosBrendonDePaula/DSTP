import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'condition',
  label: 'Condition',
  icon: '?',
  color: '#eab308',
  accent: 'text-yellow-400',
  category: 'Logica',
  description: 'Divide o fluxo em verdadeiro/falso.',
  aiDescription: 'Branch the flow: evaluate field <op> value and follow the true or false path.',
  aiEnums: {
    operator: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains',
      'not_contains', 'starts_with', 'not_starts_with', 'ends_with', 'exists'],
  },
  aiConfigExample: { field: '{{trigger.message}}', operator: 'starts_with', value: '!ban' },
  aiConfigNote: "field/operator/value are FLAT on data (not under params). value is ignored for 'exists'. Branch via sourceHandle 'true'/'false'.",
  kind: 'logic',

  subgroup: 'Ramificação',
  defaults: {},
  outputHandles: [
    { id: 'true', description: 'Followed when the condition passes.' },
    { id: 'false', description: 'Followed when the condition fails.' },
  ],
  outputSchema: {
    description: 'Condition result',
    fields: [
      { name: 'result', type: 'boolean', description: 'Whether the condition passed' },
      { name: 'field', type: 'any', description: 'The configured field' },
      { name: 'value', type: 'any', description: 'The configured comparison value' },
    ],
  },
}
