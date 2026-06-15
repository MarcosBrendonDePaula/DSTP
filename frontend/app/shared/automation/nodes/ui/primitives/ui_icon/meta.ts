import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_icon',
  label: 'Icon',
  icon: '◈',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Icone por prefab.',
  kind: 'ui-primitive',

  subgroup: 'Primitivos',
  defaults: { params: { prefab: 'log', size: '56' } },
}
