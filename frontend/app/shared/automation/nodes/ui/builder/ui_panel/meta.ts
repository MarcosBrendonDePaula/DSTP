import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_panel',
  label: 'Panel',
  icon: '▢',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Container visual de UI (raiz, conecta filhos).',
  aiDescription: 'Root of a UI built from connected ui_* child nodes. Renders the whole subtree to a player.',
  kind: 'ui-primitive',

  subgroup: 'Builder',
  defaults: { params: { userid: '{{trigger.userid}}', id: 'ui', title: '', gap: '8', anchor: 'center' } },
  outputSchema: {
    description: 'UI render result',
    fields: [
      { name: 'rendered', type: 'boolean', description: 'Always true' },
      { name: 'tree', type: 'object', description: 'The rendered UI tree' },
    ],
  },
}
