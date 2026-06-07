import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'aggregate',
  label: 'Aggregate',
  icon: '📥',
  color: '#a855f7',
  accent: 'text-purple-400',
  category: 'Dados',
  description: 'Acumula valores num array ao longo de um loop/foreach. push adiciona, reset zera.',
  aiDescription: 'Collect values into an array across loop/foreach iterations. operation "push" appends the value to the array stored under key; "reset" clears it. The array lives in the run-scoped vars namespace and is readable via {{vars.<key>}}. Output: array (the current list) and count.',
  aiParamDescriptions: {
    key: 'Name of the array to accumulate into (read later as {{vars.<key>}}).',
    operation: 'push (append value) | reset (empty the array)',
    value: 'The value to append (push). Templates allowed, e.g. {{loop.item}}.',
  },
  kind: 'data',
  defaults: { params: { operation: 'push', key: 'items', value: '' } },
  outputSchema: {
    description: 'The accumulated array',
    fields: [
      { name: 'array', type: 'object', description: 'The current accumulated list' },
      { name: 'count', type: 'number', description: 'How many items are in the array' },
    ],
  },
}
