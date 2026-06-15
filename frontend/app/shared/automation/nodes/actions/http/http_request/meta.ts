import type { NodeMeta } from '@shared/automation/nodeMeta'

export const meta: NodeMeta = {
  type: 'http_request',
  label: 'HTTP',
  icon: '🌐',
  color: '#06b6d4',
  accent: 'text-cyan-400',
  category: 'Acoes',
  description: 'Chama uma API externa.',
  aiDescription: 'Make an HTTP request (GET/POST/PUT/DELETE) to an external API and return its status/body.',
  aiParamDescriptions: {
    url: 'The full URL to call.',
    method: 'HTTP method (GET, POST, PUT, DELETE).',
    headers: 'Optional headers as a JSON object string.',
    body: 'Optional request body (string or JSON) for non-GET methods.',
  },
  kind: 'action',

  subgroup: 'Externo',  defaults: { action_type: 'http_request', params: { url: '', method: 'GET', headers: '', body: '' } },
  outputSchema: {
    description: 'HTTP response',
    fields: [
      { name: 'status', type: 'number', description: 'HTTP status code (0 on error)' },
      { name: 'ok', type: 'boolean', description: 'Whether the response was 2xx' },
      { name: 'body', type: 'any', description: 'Parsed JSON body, or raw text' },
      { name: 'error', type: 'string', description: 'Set when the request failed' },
    ],
  },
}
