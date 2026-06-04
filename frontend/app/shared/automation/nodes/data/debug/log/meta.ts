import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'log',
  label: 'Log',
  icon: '📋',
  color: '#64748b',
  accent: 'text-slate-400',
  category: 'Dados',
  description: 'Escreve uma mensagem no log do servidor (debug do fluxo).',
  aiDescription: 'Write a debug message to the server log and to this node output. Does not affect the flow.',
  aiParamDescriptions: { message: 'Text to log (templates allowed, e.g. "spawned {{loop.item}}").' },
  kind: 'data',
  defaults: { params: { message: '' } },
  outputSchema: {
    description: 'Logged message',
    fields: [{ name: 'message', type: 'string', description: 'The resolved message that was logged' }],
  },
}
