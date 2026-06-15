import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'ai_memory',
  label: 'AI Memory',
  icon: '🧠',
  color: '#d946ef',
  accent: 'text-fuchsia-400',
  category: 'IA',
  description: 'Memoria key-value que a IA usa como ferramenta (save/get/list/delete).',
  aiDescription: 'A key/value store the AI agent uses as a tool. Pick operation (save/get/list/delete) and a free-form key.',
  aiParamDescriptions: {
    operation: 'save | get | list | delete.',
    key: 'Free-form key, e.g. "player:joe:house" or "server:pvp".',
    value: 'Value to store (save only).',
  },
  kind: 'ai',

  subgroup: 'Memória da IA',
  defaults: { params: {} },
}
