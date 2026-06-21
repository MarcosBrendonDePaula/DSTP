import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'loop',
  label: 'Loop',
  icon: '🔄',
  color: '#eab308',
  accent: 'text-yellow-400',
  category: 'Logica',
  description: 'Repete o branch "body" enquanto/até a condição (mode while/until) ou até um node Break. Expõe {{loop.index}}.',
  aiDescription: 'Repeat the "body" branch. mode "while" keeps looping while the condition is true; mode "until" loops until it becomes true. A Break node inside the body also stops it. Exposes {{loop.index}}/{{loop.iteration}}. Hard-capped at 200 iterations to prevent runaway loops.',
  aiParamDescriptions: {
    mode: 'while (loop while the condition is true) | until (loop until the condition becomes true)',
  },
  aiEnums: {
    mode: ['while', 'until'],
    operator: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains',
      'not_contains', 'starts_with', 'not_starts_with', 'ends_with', 'exists'],
  },
  aiConfigExample: { params: { mode: 'while' }, field: '{{vars.counter}}', operator: 'less_than', value: '10' },
  aiConfigNote: "params.mode is nested; field/operator/value are FLAT on data. Handles: 'body'/'done'. Cap 200 iterations.",
  kind: 'logic',

  subgroup: 'Repetição',
  defaults: { params: { mode: 'while' }, field: '', operator: '', value: '' },
  outputHandles: [
    { id: 'body', description: 'The loop body, re-run each iteration.' },
    { id: 'done', description: 'Runs once after the loop stops.' },
  ],
  outputSchema: {
    description: 'Loop summary (available after the "done" handle)',
    fields: [
      { name: 'iterations', type: 'number', description: 'How many times the body ran' },
      { name: 'stoppedBy', type: 'string', description: '"condition" | "break" | "cap" | "wait"' },
      { name: 'index', type: 'number', description: 'Inside the body: current iteration index ({{loop.index}})' },
    ],
  },
}
