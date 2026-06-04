import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_tabs',
  label: 'Tabs',
  icon: '▦',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Cria abas de UI.',
  kind: 'ui-primitive',
  defaults: { params: { active: '0' } },
}
