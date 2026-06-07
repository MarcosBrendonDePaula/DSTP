import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'try_catch',
  label: 'Try / Catch',
  icon: '🛡️',
  color: '#f97316',
  accent: 'text-orange-400',
  category: 'Logica',
  description: 'Executa o branch "try"; se algum node falhar, segue o branch "catch" com o erro, em vez de quebrar o fluxo.',
  aiDescription: 'Run the "try" branch; if any node in it throws, catch the error and follow the "catch" branch instead of aborting the whole flow. The error message is exposed as {{<node>.error}}. Use to make HTTP/script/component calls recoverable.',
  kind: 'logic',
  defaults: { params: {} },
  outputSchema: {
    description: 'Try/catch result',
    fields: [
      { name: 'ok', type: 'boolean', description: 'true if the try branch finished without throwing' },
      { name: 'error', type: 'string', description: 'The error message when the try branch threw (else empty)' },
    ],
  },
}
