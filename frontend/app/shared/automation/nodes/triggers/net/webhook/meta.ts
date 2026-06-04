import type { NodeMeta } from '@shared/automation/nodeMeta'

// Webhook trigger — entry point fired by an inbound HTTP request (not a game
// event), matched by node id in evaluateEvent. No exec handler.
export const meta: NodeMeta = {
  type: 'webhook',
  label: 'Webhook',
  icon: '🪝',
  color: '#22c55e',
  accent: 'text-green-400',
  category: 'Gatilhos',
  description: 'Dispara o fluxo por uma request HTTP externa.',
  kind: 'trigger',
  defaults: { params: { method: 'ANY', token: '' } },
  flow: { isTrigger: true },
}
