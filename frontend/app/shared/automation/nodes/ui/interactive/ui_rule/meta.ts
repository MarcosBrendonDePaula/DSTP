import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_rule',
  label: 'HUD Rule',
  icon: '▥',
  color: '#818cf8',
  accent: 'text-indigo-300',
  category: 'UI',
  description: 'Instala regra dinamica de HUD.',
  aiDescription: 'Install a declarative HUD rule (when/do) the client interprets to react to local events without a backend round-trip.',
  kind: 'ui',

  subgroup: 'Interativo',
  defaults: {
    action_type: 'rule_install', preset: 'vital', vital: 'health', anchor: 'bottom', x: 0, y: 80,
    params: { userid: '{{trigger.userid}}', rules: JSON.stringify([{ id: 'health_bar', when: { event: 'healthdelta' }, do: [{ action: 'update_widget', id: 'health_bar_w', type: 'progress_bar', value: '{{player.health_current}}', max: '{{player.health_max}}', label: 'HP', color: [0.2, 0.9, 0.2, 1], anchor: 'bottom', x: 0, y: 80, width: 220, height: 16 }] }]) },
  },
  outputSchema: {
    description: 'Rule installed',
    fields: [{ name: 'executed', type: 'boolean', description: 'Always true' }],
  },
}
