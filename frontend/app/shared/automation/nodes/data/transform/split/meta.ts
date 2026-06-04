import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'split',
  label: 'Split',
  icon: '✂',
  color: '#a855f7',
  accent: 'text-purple-400',
  category: 'Dados',
  description: 'Quebra um texto em partes por um separador (ex.: "!comprar lança 2" → partes).',
  aiDescription: 'Split a string into parts by a separator (default: space). Exposes the parts array plus each part by index (part1, part2, …) and a count. Useful to read the words of a chat command without a dedicated parser.',
  aiParamDescriptions: {
    value: 'The input string (template allowed, e.g. {{chat.message}}).',
    separator: 'Separator between parts. Empty = whitespace (one or more spaces).',
    trim: 'true to trim each part and drop empty ones (default true).',
  },
  kind: 'data',
  defaults: { params: { value: '{{chat.message}}', separator: '', trim: 'true' } },
  outputSchema: {
    description: 'Split result',
    fields: [
      { name: 'parts', type: 'object', description: 'All parts as an array' },
      { name: 'count', type: 'number', description: 'How many parts' },
      { name: 'first', type: 'string', description: 'First part (parts[0])' },
      { name: 'rest', type: 'string', description: 'Everything after the first part, re-joined' },
      { name: 'part1', type: 'string', description: 'First part (also part2, part3, … up to part10)' },
    ],
  },
}
