import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_spacer',
  label: 'Spacer',
  icon: '␣',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Espacamento fixo.',
  kind: 'ui-primitive',
  defaults: { params: { height: '8' } },
}
