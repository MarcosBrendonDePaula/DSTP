import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_builder',
  label: 'UI Builder',
  icon: '✦',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI',
  description: 'Monta uma UI por arvore visual.',
  aiDescription: 'Render a complete UI tree (built in the node editor) to a player, then continue the flow.',
  aiParamDescriptions: { userid: 'Player to show the UI to.', id: 'UI/group id.', anchor: 'Screen anchor (center, top, ...).' },
  kind: 'ui',
  defaults: { params: { userid: '{{trigger.userid}}', id: 'ui', anchor: 'center' }, tree: { type: 'panel', title: 'Painel', children: [] } },
  outputSchema: {
    description: 'UI render result',
    fields: [{ name: 'rendered', type: 'boolean', description: 'Always true' }],
  },
}
