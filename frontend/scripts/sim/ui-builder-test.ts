#!/usr/bin/env bun
// Validates ui_builder: the ENTIRE shop UI as one literal tree inside a single
// node (data.tree), instead of ~25 ui_* nodes. Same rendered tree, templates
// resolved. Proves the in-node authoring path works end to end.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'

const server = 'sim-builder'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_b'

// The whole shop as one tree. This is what the in-node editor will produce.
const TREE = {
  type: 'panel', title: 'Loja', gap: 8,
  children: [
    { type: 'text', id: 'saldo_txt', text: 'Suas moedas: {{bal.value}}', size: 20, color: [1, 0.9, 0.4, 1] },
    { type: 'tabs', active: 0, tabs: [
      { label: 'Comprar', child: { type: 'col', gap: 6, children: [
        { type: 'row', gap: 12, children: [
          { type: 'icon', prefab: 'log', size: 48 },
          { type: 'text', text: 'Madeira x10 (5)' },
          { type: 'button', text: 'Comprar', callback: 'buy_log', width: 110 },
        ]},
        { type: 'row', gap: 12, children: [
          { type: 'icon', prefab: 'gears', size: 48 },
          { type: 'text', text: 'Engrenagem (50)' },
          { type: 'button', text: 'Comprar', callback: 'buy_gears', width: 110 },
        ]},
      ]}},
      { label: 'Vender', child: { type: 'col', gap: 6, children: [
        { type: 'row', gap: 12, children: [
          { type: 'icon', prefab: 'log', size: 48 },
          { type: 'text', text: 'Madeira (3)' },
          { type: 'button', text: 'Vender', callback: 'sell_log', width: 110 },
        ]},
      ]}},
    ]},
  ],
}

new FlowRepository(server).save({
  id: 'shop-builder', name: 'Loja (ui_builder)', enabled: true,
  nodes: [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
    { id: 'cond', type: 'condition', position: { x: 150, y: 0 }, data: { field: '{{tm.message}}', operator: 'contains', value: 'loja' } },
    { id: 'bal', type: 'memory', position: { x: 300, y: 0 }, data: { action: 'read', alias: 'bal', params: { key: 'coins:{{tm.userid}}', flow: 'shop-buy' } } },
    { id: 'ui', type: 'ui_builder', position: { x: 450, y: 0 }, data: { tree: TREE, params: { id: 'loja', userid: '{{tm.userid}}' } } },
  ],
  edges: [
    { id: 'e1', source: 'trg', target: 'cond' },
    { id: 'e2', source: 'cond', target: 'bal', sourceHandle: 'true' },
    { id: 'e3', source: 'bal', target: 'ui' },
  ],
})
new FlowMemoryRepository(server).set('shop-buy', `coins:${USER}`, 42)

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: USER, name: 'B' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const got: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); got.push(...(r.commands || [])) } return got }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

await sync([]); await sleep(300)
await sync([{ type: 'chat_message', data: { userid: USER, name: 'B', message: '#loja' } }])
const got = await drain()
const tree = got.find(c => c.type === 'ui_command' && c.data?.cmd?.type === 'tree')?.data?.cmd?.tree
ck(!!tree, `árvore emitida [tipos: ${[...new Set(got.map(c => c.type))].join(',')}]`)
ck(tree?.type === 'panel' && tree?.title === 'Loja', 'panel Loja')
const saldo = tree?.children?.find((c: any) => c.id === 'saldo_txt')
ck(saldo?.text === 'Suas moedas: 42', `saldo resolvido do template [got "${saldo?.text}"]`)
const tabs = tree?.children?.find((c: any) => c.type === 'tabs')
ck(tabs?.tabs?.length === 2 && tabs.tabs[0].label === 'Comprar', `tabs Comprar/Vender [${tabs?.tabs?.map((t: any) => t.label).join(',')}]`)
const buyBtn = tabs?.tabs?.[0]?.child?.children?.[0]?.children?.find((c: any) => c.type === 'button')
ck(buyBtn?.callback === 'buy_log', `botão comprar callback buy_log [got ${buyBtn?.callback}]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
