import type { NodeMeta } from '@shared/automation/nodeMeta'

// Micro-DOM (task 10): mutate a UI already open on the player's screen by node id —
// append a node written as HTML, remove one, patch props, toggle visibility. The
// backend parses the HTML (jsdom); the game receives tree JSON. Pair with a
// `callback="prefix:*"` wildcard on the ui_builder to wire buttons appended here.
export const meta: NodeMeta = {
  type: 'ui_dom',
  label: '🧩 UI DOM (append/remove)',
  icon: '🧩',
  color: '#3b82f6',
  accent: 'text-blue-400',
  category: 'Acoes',
  subgroup: 'Interface',
  description: 'Altera uma UI aberta: adiciona (HTML), remove, atualiza ou esconde um nó pelo id.',
  aiDescription: 'Mutate an open UI tree in place: append a node (given as HTML) under a parent id, remove a node, set props on it, or toggle its visibility. The UI must already be open (ui_builder) and nodes need ids.',
  aiParamDescriptions: {
    userid: 'Player whose UI to change.', id: 'UI id (the ui_builder "ID da UI").',
    operation: 'append | remove | set | toggle', node: 'Target node id (for append: the PARENT id; empty = root).',
    html: 'append only: the node to add, as HTML (e.g. <button id="b1" callback="extra:b1">Extra</button>).',
    props: 'set only: JSON of props to patch (e.g. {"text":"Oi"}).', visible: 'toggle only: true/false to force; empty = flip.',
  },
  aiEnums: { 'params.operation': ['append', 'remove', 'set', 'toggle'] },
  kind: 'action',
  params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'ID da UI', placeholder: 'loja' },
    { key: 'operation', label: 'Operação (append/remove/set/toggle)', placeholder: 'append' },
    { key: 'node', label: 'Node ID (append: id do PAI, vazio = raiz)', placeholder: 'lista' },
    { key: 'html', label: 'HTML do nó (append)', placeholder: '<button id="b1" callback="extra:b1">Extra</button>' },
    { key: 'index', label: 'Posição (append, opcional)', placeholder: '' },
    { key: 'props', label: 'Props JSON (set)', placeholder: '{"text":"Oi"}' },
    { key: 'visible', label: 'Visível (toggle: true/false, vazio = inverte)', placeholder: '' },
  ],
  defaults: { action_type: 'ui_dom', params: { userid: '{{trigger.userid}}', operation: 'append' } },
  outputSchema: {
    description: 'ui_dom result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'true when a command was queued' },
      { name: 'operation', type: 'string', description: 'append | remove | set | toggle' },
      { name: 'node', type: 'object', description: 'append: the parsed node that was sent' },
      { name: 'error', type: 'string', description: 'set when the HTML/JSON could not be parsed' },
    ],
  },
}
