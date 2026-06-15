import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'edit_variable',
  label: 'Edit Variable',
  icon: '✏️',
  color: '#a855f7',
  accent: 'text-purple-400',
  category: 'Dados',
  description: 'Muta uma variável em memória (vars): set, inc, dec, append, toggle, delete. Leia com {{vars.chave}}.',
  aiDescription: 'Mutate an in-memory flow variable read later via {{vars.<key>}}. Operations: set, inc, dec, append, toggle, delete. Variables live for the duration of one flow run (not persisted — use the memory node for cross-run state).',
  aiParamDescriptions: {
    key: 'Variable name. Read it later as {{vars.<key>}}.',
    operation: 'set | inc | dec | append | toggle | delete',
    value: 'For set/append: the value. For inc/dec: the amount (default 1). Ignored by toggle/delete.',
  },
  kind: 'data',

  subgroup: 'Variáveis',
  defaults: { params: { operation: 'set', key: '', value: '' } },
  outputSchema: {
    description: 'The variable after the operation',
    fields: [
      { name: 'key', type: 'string', description: 'The variable name' },
      { name: 'value', type: 'any', description: 'The new value after the operation' },
      { name: 'operation', type: 'string', description: 'The operation applied' },
    ],
  },
}
