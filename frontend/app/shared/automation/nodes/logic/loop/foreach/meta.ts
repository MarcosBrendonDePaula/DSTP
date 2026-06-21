import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'foreach',
  label: 'For Each',
  icon: '🔁',
  color: '#eab308',
  accent: 'text-yellow-400',
  category: 'Logica',
  description: 'Itera uma lista: roda a saída "each" por item, depois "done".',
  aiDescription: 'Iterate a list: run the "each" branch once per item (with {{loop.item}}/{{loop.index}}), then the "done" branch. Capped to avoid runaway loops.',
  aiParamDescriptions: {
    list: 'The array to iterate (e.g. {{getPlayers.players}} or a {{node.field}} that resolves to an array).',
  },
  aiConfigExample: { params: { list: '{{listAllPlayers.players}}' } },
  aiConfigNote: "params.list must resolve to an array. Handles 'each' (per item) / 'done'. Inside 'each' use {{loop.item}} and {{loop.index}}. Cap 40.",
  kind: 'logic',

  subgroup: 'Repetição',
  defaults: { params: { list: '' } },
  outputHandles: [
    { id: 'each', description: 'Runs once per list item ({{loop.item}}/{{loop.index}}).' },
    { id: 'done', description: 'Runs once after the iteration finishes.' },
  ],
  outputSchema: {
    description: 'Loop summary (available after "done")',
    fields: [
      { name: 'count', type: 'number', description: 'How many items were iterated' },
      { name: 'item', type: 'any', description: 'Current item — only inside the "each" branch, as {{loop.item}}' },
      { name: 'index', type: 'number', description: 'Current index — inside "each", as {{loop.index}}' },
    ],
  },
}
