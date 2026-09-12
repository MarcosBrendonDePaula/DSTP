import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_menu',
  label: 'Menu',
  icon: '▤',
  color: '#818cf8',
  accent: 'text-indigo-300',
  category: 'UI',
  description: '[legado] Menu de botoes para o jogador. Prefira o UI Builder (HTML) com <button callback>.',
  aiDescription: 'Open an interactive button menu for a player; each button click fires a ui_callback event.',
  kind: 'ui',
  legacy: true,

  subgroup: 'Interativo',
  defaults: { action_type: 'ui_menu', buttons: [], params: { userid: '{{trigger.userid}}', id: 'menu', title: '', body: '', buttons: '[]' } },
  outputSchema: {
    description: 'Menu dispatched',
    fields: [{ name: 'executed', type: 'boolean', description: 'Always true' }],
  },
}
