import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_row',
  label: 'Row',
  icon: '↔',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Agrupa filhos na horizontal.',
  kind: 'ui-primitive',

  subgroup: 'Primitivos',
  defaults: { params: { gap: '8' } },
}
