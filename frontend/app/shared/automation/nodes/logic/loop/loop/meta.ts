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
  kind: 'logic',
  defaults: { params: { mode: 'while' }, field: '', operator: '', value: '' },
  outputSchema: {
    description: 'Loop summary (available after the "done" handle)',
    fields: [
      { name: 'iterations', type: 'number', description: 'How many times the body ran' },
      { name: 'stoppedBy', type: 'string', description: '"condition" | "break" | "cap" | "wait"' },
      { name: 'index', type: 'number', description: 'Inside the body: current iteration index ({{loop.index}})' },
    ],
  },
}
