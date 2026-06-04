import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'set_variable',
  label: 'Variable',
  icon: '📝',
  color: '#a855f7',
  accent: 'text-purple-400',
  category: 'Dados',
  description: 'Grava valor no contexto do fluxo.',
  aiDescription: 'Store one or more key/value pairs in the flow context for later steps to read.',
  kind: 'data',
  defaults: { action_type: 'set_variable', params: {} },
  outputSchema: {
    description: 'The stored variables (one field per key you set)',
    fields: [
      { name: '<your keys>', type: 'any', description: 'Each param key becomes a field, resolved from its value/template' },
    ],
  },
}
