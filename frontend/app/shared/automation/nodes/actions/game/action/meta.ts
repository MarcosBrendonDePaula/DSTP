import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'action',
  label: 'Action',
  icon: '◎',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  description: 'Executa uma acao no jogo (heal, kick, tp, spawn...).',
  aiDescription: 'Run a DST game action. The specific action is chosen via action_type (heal, kick, teleport, give_item, ...).',
  kind: 'action',
  // The palette exposes action subtypes via ACTION_TYPES, not this generic node;
  // hidden so it doesn't show as a bare "Action" entry.
  hidden: true,
  defaults: { action_type: '', params: {} },
  outputSchema: {
    description: 'Action dispatched',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Always true' },
      { name: 'action', type: 'string', description: 'The action_type that ran' },
    ],
  },
}
