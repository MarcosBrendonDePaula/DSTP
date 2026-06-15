import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_button',
  label: 'Button',
  icon: '●',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Botao com callback.',
  kind: 'ui-primitive',

  subgroup: 'Primitivos',
  defaults: { params: { text: 'Comprar', callback: 'click' } },
}
