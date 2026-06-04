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
  kind: 'logic',
  // cases: [{ value }] — each case index i has a source handle "case_<i>"; there
  // is always a "default" handle for the no-match path.
  defaults: { field: '', cases: [{ value: '' }] },
  outputSchema: {
    description: 'Switch result',
    fields: [
      { name: 'matched', type: 'string', description: 'The handle taken: case_<i> or default' },
      { name: 'value', type: 'any', description: 'The resolved field value that was matched' },
    ],
  },
}
