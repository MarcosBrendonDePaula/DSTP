import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'break',
  label: 'Break',
  icon: '⏹️',
  color: '#ef4444',
  accent: 'text-red-400',
  category: 'Logica',
  description: 'Interrompe o loop mais próximo. Opcionalmente só quando uma condição é verdadeira.',
  aiDescription: 'Stop the nearest enclosing Loop node. Optionally only when a condition holds (set conditional + field/operator/value); otherwise it always breaks.',
  kind: 'logic',
  defaults: { params: { conditional: false }, field: '', operator: '', value: '' },
  outputSchema: {
    description: 'Break signal',
    fields: [
      { name: 'broke', type: 'boolean', description: 'Whether the break fired this time' },
    ],
  },
}
