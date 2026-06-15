import type { NodeMeta } from '@shared/automation/nodeMeta'

// Wait/merge node. Its EXECUTION is special (stateful pause via
// executeStatefulBranch / WorkflowInstanceStore) and lives in the engine
// orchestrator, NOT in a registry handler — so this module is meta+ui only.
// `flow.pausable` tells FlowAnalyzer this node makes a flow stateful.
export const meta: NodeMeta = {
  type: 'wait',
  label: 'Wait / Merge',
  icon: '↔',
  color: '#ec4899',
  accent: 'text-pink-400',
  category: 'Logica',
  description: 'Espera outros eventos ou junta caminhos.',
  kind: 'logic',

  subgroup: 'Mesclagem',
  defaults: { mode: 'all', correlation: 'broadcast', timeoutMs: '300000', timeoutAction: 'discard' },
  flow: { pausable: true },
}
