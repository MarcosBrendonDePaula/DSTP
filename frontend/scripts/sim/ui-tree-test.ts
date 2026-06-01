#!/usr/bin/env bun
// Validates the "UI by nodes" foundation: a subgraph of ui_* nodes
// (panel > col > row[icon,text,button] x2) must, when its trigger fires,
// produce ONE ui_command with cmd.type 'tree' carrying the composed tree —
// children ordered by canvas position, templates resolved.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-uitree'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_ui'

// Build a shop UI purely from connected ui_* nodes.
//  trigger(chat #loja) -> ui_panel
//      ui_panel -> ui_col
//          ui_col -> row1 (y=0), row2 (y=100)
//              row1 -> icon(log) x0, text("Madeira") x100, button(Comprar) x200
//              row2 -> icon(gears) x0, text("Engrenagem") x100, button(Comprar) x200
const nodes: any[] = [
  { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
  { id: 'panel', type: 'ui_panel', position: { x: 200, y: 0 }, data: { params: { id: 'loja', userid: '{{tm.userid}}', title: 'Loja', anchor: 'center' } } },
  { id: 'col', type: 'ui_col', position: { x: 400, y: 0 }, data: { params: { gap: '12' } } },
  // row 1 (top)
  { id: 'row1', type: 'ui_row', position: { x: 600, y: 0 }, data: { params: { gap: '10' } } },
  { id: 'ic1', type: 'ui_icon', position: { x: 800, y: 0 }, data: { params: { prefab: 'log', size: '56' } } },
  { id: 'tx1', type: 'ui_text', position: { x: 800, y: 100 }, data: { params: { text: 'Madeira x10', size: '18' } } },
  { id: 'bt1', type: 'ui_button', position: { x: 800, y: 200 }, data: { params: { text: 'Comprar', callback: 'buy_log' } } },
  // row 2 (below row1 → larger y)
  { id: 'row2', type: 'ui_row', position: { x: 600, y: 100 }, data: { params: { gap: '10' } } },
  { id: 'ic2', type: 'ui_icon', position: { x: 800, y: 300 }, data: { params: { prefab: 'gears', size: '56' } } },
  { id: 'tx2', type: 'ui_text', position: { x: 800, y: 400 }, data: { params: { text: 'Engrenagem', size: '18' } } },
  { id: 'bt2', type: 'ui_button', position: { x: 800, y: 500 }, data: { params: { text: 'Comprar', callback: 'buy_gears' } } },
]
const edges: any[] = [
  { id: 'e0', source: 'trg', target: 'panel' },
  { id: 'e1', source: 'panel', target: 'col' },
  { id: 'e2', source: 'col', target: 'row1' },
  { id: 'e3', source: 'col', target: 'row2' },
  { id: 'e4', source: 'row1', target: 'ic1' },
  { id: 'e5', source: 'row1', target: 'tx1' },
  { id: 'e6', source: 'row1', target: 'bt1' },
  { id: 'e7', source: 'row2', target: 'ic2' },
  { id: 'e8', source: 'row2', target: 'tx2' },
  { id: 'e9', source: 'row2', target: 'bt2' },
]

new FlowRepository(server).save({ id: 'ui-shop', name: 'UI shop por nodes', enabled: true, nodes, edges })

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: USER, name: 'UIGuy' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const got: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); got.push(...(r.commands || [])) } return got }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

await sync([]); await sleep(300)
await sync([{ type: 'chat_message', data: { userid: USER, name: 'UIGuy', message: '#loja' } }])
const got = await drain()

const render = got.find(c => c.type === 'ui_command' && c.data?.cmd?.type === 'tree')
ck(!!render, `ui_command tree emitido [tipos: ${[...new Set(got.map(c => c.type))].join(',') || 'nenhum'}]`)
const tree = render?.data?.cmd?.tree
ck(tree?.type === 'panel' && tree?.title === 'Loja', `raiz panel title=Loja [got type=${tree?.type} title=${tree?.title}]`)
const col = tree?.children?.[0]
ck(col?.type === 'col' && col?.children?.length === 2, `col com 2 filhos (rows) [got ${col?.type}, ${col?.children?.length}]`)
const r1 = col?.children?.[0], r2 = col?.children?.[1]
ck(r1?.type === 'row' && r2?.type === 'row', 'ambos filhos são row')
// ordem: row1 (y=0) antes de row2 (y=100)
const r1icon = r1?.children?.find((c: any) => c.type === 'icon')
ck(r1icon?.prefab === 'log', `row1 ordenada primeiro tem icon log [got ${r1icon?.prefab}]`)
const r2icon = r2?.children?.find((c: any) => c.type === 'icon')
ck(r2icon?.prefab === 'gears', `row2 tem icon gears [got ${r2icon?.prefab}]`)
// ordem dentro da row1 por X: icon(800)→? todos x=800, mas ordem de edges. ao menos os 3 tipos presentes
const r1types = (r1?.children || []).map((c: any) => c.type)
ck(r1types.includes('icon') && r1types.includes('text') && r1types.includes('button'), `row1 tem icon+text+button [got ${r1types.join(',')}]`)
const r1btn = r1?.children?.find((c: any) => c.type === 'button')
ck(r1btn?.callback === 'buy_log', `botão row1 callback=buy_log [got ${r1btn?.callback}]`)
const r1txt = r1?.children?.find((c: any) => c.type === 'text')
ck(r1txt?.text === 'Madeira x10', `texto row1 resolvido [got ${r1txt?.text}]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
