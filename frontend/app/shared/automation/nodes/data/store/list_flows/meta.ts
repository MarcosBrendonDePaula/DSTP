import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'list_flows',
  label: 'List Flows',
  icon: '📜',
  color: '#0ea5e9',
  accent: 'text-sky-400',
  category: 'Dados',
  description: 'Lista os fluxos do servidor (nome, ativo, pasta) — útil para um !help automático.',
  aiDescription: 'List the automation flows on this server. Each item has name, enabled, folderPath, nodeCount, edgeCount. Use it to build a self-updating help/menu. Optional filters: onlyEnabled, folder (exact path), startsWith (name prefix, e.g. "!").',
  aiParamDescriptions: {
    onlyEnabled: 'true to list only enabled flows.',
    folder: 'Only flows in this exact folder path (empty = any).',
    startsWith: 'Only flows whose name starts with this (e.g. "!" for commands).',
  },
  kind: 'data',
  defaults: { params: { onlyEnabled: 'true', folder: '', startsWith: '' } },
  outputSchema: {
    description: 'Flow list',
    fields: [
      { name: 'flows', type: 'object', description: 'Array of { name, enabled, folderPath, nodeCount, edgeCount }' },
      { name: 'names', type: 'object', description: 'Array of just the names (handy for {{node.names}})' },
      { name: 'count', type: 'number', description: 'How many flows matched' },
      { name: 'text', type: 'string', description: 'Names joined by newlines — ready for a help panel body' },
    ],
  },
}
