import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_text',
  label: 'Text',
  icon: 'T',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Texto dinamico.',
  kind: 'ui-primitive',
  defaults: { params: { text: 'Texto', size: '18' } },
}
