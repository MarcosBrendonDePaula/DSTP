import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'transform',
  label: 'Transform',
  icon: '🔧',
  color: '#a855f7',
  accent: 'text-purple-400',
  category: 'Dados',
  description: 'Transforma um valor (texto, número, json) sem precisar de script.',
  aiDescription: 'Transform a value with a safe operation: uppercase/lowercase/trim, number add/sub/mul/div/round, json parse/stringify. No code.',
  aiParamDescriptions: {
    value: 'The input value (template allowed, e.g. {{trigger.name}}).',
    operation: 'uppercase | lowercase | trim | length | number | round | add | sub | mul | div | json_parse | json_stringify | after | before | replace',
    operand: 'Second operand: math ops (add/sub/mul/div) use it as the number; after/before/replace use it as the separator/needle.',
    replacement: 'For the replace op: the text to substitute each occurrence of operand with. Empty = remove (delete the occurrences).',
  },
  kind: 'data',

  subgroup: 'Transformar',
  defaults: { params: { value: '', operation: 'uppercase', operand: '', replacement: '' } },
  outputSchema: {
    description: 'Transform result',
    fields: [{ name: 'value', type: 'any', description: 'The transformed value' }],
  },
}
