import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'script',
  label: 'Script',
  icon: '🧩',
  color: '#f97316',
  accent: 'text-orange-400',
  category: 'Acoes',
  description: 'Executa codigo customizado.',
  aiDescription: 'Run a custom JavaScript run(context) function (admin-only). Its return value becomes the node output. context.dom(html) returns a jsdom document (querySelector/createElement/appendChild...) and context.html(doc) serializes it back — return { html } and feed it to a ui_builder html param to render server-built UI.',
  aiParamDescriptions: { code: 'JS source defining `async function run(context) { ... }`.' },
  kind: 'action',

  subgroup: 'Código',  defaults: {
    action_type: 'script',
    params: { code: 'async function run(context) {\n  // context.trigger tem os dados do evento\n  // Retorne um objeto com os resultados\n  return {\n    result: "ok"\n  }\n}' },
  },
  outputSchema: {
    description: 'Whatever the run() function returns',
    fields: [
      { name: '<your return>', type: 'any', description: 'The object returned by run(context)' },
    ],
  },
}
