import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'memory',
  label: 'Memory',
  icon: '▣',
  color: '#f59e0b',
  accent: 'text-amber-400',
  category: 'Dados',
  description: 'Le ou escreve memoria persistente.',
  aiDescription: 'Persistent per-flow key/value store. Read, write, delete a key or read all keys. Survives restarts (SQLite).',
  aiParamDescriptions: {
    key: 'The key to read/write/delete.',
    value: 'Value to store (for write).',
    flow: 'Optional namespace override to share memory across flows.',
  },
  kind: 'data',

  subgroup: 'Armazenamento',
  defaults: { action: 'read', params: { key: '' } },
  aiEnums: { action: ['read', 'write', 'delete', 'read_all'] },
  aiConfigExample: { action: 'read', params: { key: 'coins:{{trigger.userid}}' }, alias: 'bal' },
  aiConfigNote: "action is FLAT on data. write uses params.value. Output {{alias.value}}.",
  outputSchema: {
    description: 'Result of the memory operation',
    fields: [
      { name: 'action', type: 'string', description: 'read | write | delete | read_all' },
      { name: 'key', type: 'string', description: 'The key operated on' },
      { name: 'value', type: 'any', description: 'The stored value (read/write); null if absent' },
      { name: 'data', type: 'object', description: 'All key/values (read_all only)' },
    ],
  },
}
