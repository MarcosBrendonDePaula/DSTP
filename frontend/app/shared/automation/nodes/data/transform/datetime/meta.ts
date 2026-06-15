import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'datetime',
  label: 'Date / Time',
  icon: '🕒',
  color: '#06b6d4',
  accent: 'text-cyan-400',
  category: 'Dados',
  description: 'Data/hora: agora, formatar, somar tempo, ou diferença entre dois instantes.',
  aiDescription: 'Date/time helper. operation: now (current epoch ms + ISO), format (an input timestamp to a readable string), add (add an amount of a unit to a timestamp), diff (difference between two timestamps in a unit). Timestamps are epoch milliseconds.',
  aiParamDescriptions: {
    operation: 'now | format | add | diff',
    value: 'Input timestamp (epoch ms) for format/add, and the FIRST timestamp for diff. Empty = now.',
    value2: 'The SECOND timestamp for diff (epoch ms). Empty = now.',
    amount: 'For add: how much to add (can be negative to subtract).',
    unit: 'For add/diff: ms | seconds | minutes | hours | days.',
  },
  kind: 'data',

  subgroup: 'Transformar',
  defaults: { params: { operation: 'now', value: '', value2: '', amount: '0', unit: 'seconds' } },
  outputSchema: {
    description: 'Date/time result',
    fields: [
      { name: 'ms', type: 'number', description: 'Epoch milliseconds (now/add result)' },
      { name: 'iso', type: 'string', description: 'ISO-8601 string of the result' },
      { name: 'value', type: 'any', description: 'Primary result: ms for now/add, the formatted string for format, the numeric diff for diff' },
    ],
  },
}
