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
  kind: 'logic',

  subgroup: 'Ramificação',
  defaults: {},
  outputSchema: {
    description: 'Condition result',
    fields: [
      { name: 'result', type: 'boolean', description: 'Whether the condition passed' },
      { name: 'field', type: 'any', description: 'The configured field' },
      { name: 'value', type: 'any', description: 'The configured comparison value' },
    ],
  },
}
