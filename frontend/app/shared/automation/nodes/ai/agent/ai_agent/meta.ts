import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ai_agent',
  label: 'AI Agent',
  icon: '🤖',
  color: '#d946ef',
  accent: 'text-fuchsia-400',
  category: 'IA',
  description: 'IA que usa nos conectados como ferramentas (porta tools).',
  aiDescription: 'An LLM agent whose tools are the nodes wired to its tools handle.',
  kind: 'action',
  defaults: { provider: 'anthropic', model: '', max_steps: '8', params: {} },
  outputSchema: {
    description: 'Agent run result',
    fields: [
      { name: 'text', type: 'string', description: 'The model\'s final message' },
      { name: 'steps', type: 'number', description: 'How many agentic steps ran' },
      { name: 'toolCalls', type: 'object', description: 'The tools the model invoked' },
    ],
  },
}
