import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'switch',
  label: 'Switch',
  icon: '⑂',
  color: '#eab308',
  accent: 'text-yellow-400',
  category: 'Logica',
  description: 'Roteia o fluxo por valor (case 1, case 2, ... ou default).',
  aiDescription: 'Route the flow by matching a field against a list of exact-value cases; falls through to default if none match.',
  aiConfigExample: { field: '{{trigger.prefab}}', cases: [{ value: 'wilson' }, { value: 'wendy' }, { value: 'wx78' }] },
  aiConfigNote: "cases is an array of {value} (equality only). Handles are case_0..case_N (0-based, one per cases entry) plus 'default'.",
  kind: 'logic',

  subgroup: 'Ramificação',
  // cases: [{ value }] — each case index i has a source handle "case_<i>"; there
  // is always a "default" handle for the no-match path.
  defaults: { field: '', cases: [{ value: '' }] },
  outputHandles: [
    { id: 'case_<i>', dynamic: true, description: 'One handle per entry in data.cases, indexed from 0 (case_0, case_1, ...). Wire each case to its branch.' },
    { id: 'default', description: 'Followed when no case matches.' },
  ],
  outputSchema: {
    description: 'Switch result',
    fields: [
      { name: 'matched', type: 'string', description: 'The handle taken: case_<i> or default' },
      { name: 'value', type: 'any', description: 'The resolved field value that was matched' },
    ],
  },
}
