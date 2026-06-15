import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_bar',
  label: 'Bar',
  icon: '▰',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Barra de progresso.',
  kind: 'ui-primitive',

  subgroup: 'Primitivos',
  defaults: { params: { value: '1', max: '1' } },
}
