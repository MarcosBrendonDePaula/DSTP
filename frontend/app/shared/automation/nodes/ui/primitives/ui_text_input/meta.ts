import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ui_text_input',
  label: 'Text Input',
  icon: '⌨',
  color: '#8b5cf6',
  accent: 'text-violet-300',
  category: 'UI Primitivos',
  description: 'Campo de texto editavel no HUD. Enter envia o valor (ui_callback).',
  kind: 'ui-primitive',

  subgroup: 'Primitivos',
  defaults: { params: { callback: 'submit', placeholder: '', size: '22', width: '280', height: '36' } },
}
