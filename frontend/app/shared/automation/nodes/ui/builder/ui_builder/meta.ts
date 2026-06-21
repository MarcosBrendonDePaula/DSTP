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

  subgroup: 'Builder',
  defaults: { params: { userid: '{{trigger.userid}}', id: 'ui', anchor: 'center' }, tree: { type: 'panel', title: 'Painel', children: [] } },
  aiEnums: {
    'params.anchor': ['center', 'top', 'topleft', 'topright', 'left', 'right', 'bottom', 'bottomleft', 'bottomright'],
  },
  aiConfigExample: {
    params: { userid: '{{trigger.userid}}', id: 'welcome', anchor: 'center' },
    tree: {
      type: 'panel', title: 'Bem-vindo', width: 280, gap: 10,
      children: [
        { type: 'text', id: 'msg', text: 'Ola {{trigger.name}}!', size: 18, color: [1, 1, 1, 1] },
        { type: 'button', text: 'Pegar recompensa', callback: 'claim', width: 200, height: 44, color: [0.3, 0.7, 0.3, 1] },
      ],
    },
  },
  aiConfigNote: 'data.tree is a recursive UI tree (sibling of data.params). See UI TREE GRAMMAR in the prompt. A tree node with callback:"x" auto-exposes an output handle "cb:x" to wire the click.',
  outputSchema: {
    description: 'UI render result',
    fields: [{ name: 'rendered', type: 'boolean', description: 'Always true' }],
  },
}
