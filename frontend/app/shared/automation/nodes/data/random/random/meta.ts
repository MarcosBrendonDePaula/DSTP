import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'random',
  label: 'Random',
  icon: '🎲',
  color: '#f59e0b',
  accent: 'text-amber-400',
  category: 'Dados',
  description: 'Sorteia um item de uma lista (ou um número num intervalo).',
  aiDescription: 'Pick a random item from a list, or a random integer in [min,max]. Use list OR min/max.',
  aiParamDescriptions: {
    list: 'Array or comma-separated values to pick from.',
    min: 'Lower bound (integer mode, when no list).',
    max: 'Upper bound (integer mode, when no list).',
  },
  kind: 'data',

  subgroup: 'Aleatório',
  defaults: { params: { list: '', min: '', max: '' } },
  aiConfigExample: { params: { min: '1', max: '6' }, alias: 'd' },
  aiConfigNote: 'params.min/max for an integer, OR params.list for a random list pick. Output {{alias.value}}.',
  outputSchema: {
    description: 'Random pick',
    fields: [
      { name: 'value', type: 'any', description: 'The chosen item or number' },
      { name: 'index', type: 'number', description: 'Index of the chosen item (list mode)' },
    ],
  },
}
