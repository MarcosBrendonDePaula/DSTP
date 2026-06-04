import type { NodeMeta } from '@shared/automation/nodeMeta'

// The generic game-event trigger. It's the flow entry point for DST events
// (matched by data.event_type in evaluateEvent), so it has no exec handler.
// The palette exposes one entry PER event via TRIGGER_EVENTS, not this bare node.
export const meta: NodeMeta = {
  type: 'trigger',
  label: 'Trigger',
  icon: '⚡',
  color: '#22c55e',
  accent: 'text-green-400',
  category: 'Gatilhos',
  description: 'Evento do jogo que inicia o fluxo.',
  kind: 'trigger',
  hidden: true,
  defaults: {},
  flow: { isTrigger: true },
}
