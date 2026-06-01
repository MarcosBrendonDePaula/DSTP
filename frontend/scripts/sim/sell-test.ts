#!/usr/bin/env bun
// Validates the SELL cycle (backend side; the Lua remove_item is mocked by us
// injecting the item_removed event the mod would emit):
//   1) ui_callback sell_log → command remove_item{prefab:log, count:1}
//   2) (mod removes, emits item_removed success) → we inject that event
//   3) flow shop-sell-credit credits coins on success + updates the balance text
//
// A failed removal (success:false) must NOT credit coins.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'

const server = 'sim-sell'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_sell'

// Sell prices (cheaper than buy). callback sell_<prefab> → { prefab, price }
const SELL = { sell_log: { prefab: 'log', price: 3 }, sell_gears: { prefab: 'gears', price: 30 } }

const repo = new FlowRepository(server)

// Flow A: click sell button → emit remove_item with a token = the callback,
// so the credit flow knows what was sold (via the echoed token + prefab).
const SELL_CODE = `async function run(context) {
  const sell = ${JSON.stringify(SELL)};
  const cb = context.trigger.callback || context.trigger.callback_name;
  const it = sell[cb];
  if (!it) return { found: false };
  return { found: true, prefab: it.prefab, price: it.price };
}`
repo.save({
  id: 'shop-sell', name: 'Loja: vender (clique)', enabled: true,
  nodes: [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'ui_callback', alias: 'click' } },
    { id: 'it', type: 'action', position: { x: 200, y: 0 }, data: { action_type: 'script', alias: 'it', params: { code: SELL_CODE } } },
    // remove 1 of the prefab; token carries the price so the credit flow knows the value
    { id: 'rem', type: 'action', position: { x: 400, y: 0 }, data: { action_type: 'remove_item', params: { userid: '{{click.userid}}', prefab: '{{it.prefab}}', count: '1', token: '{{it.price}}' } } },
  ],
  edges: [{ id: 'e1', source: 'trg', target: 'it' }, { id: 'e2', source: 'it', target: 'rem' }],
})

// Flow B: item_removed (success) → credit coins by the token (price) + bump balance.
const CREDIT_CODE = `async function run(context) {
  const ev = context.trigger;
  const price = Number(ev.token) || 0;
  const cur = Number(context.bal && context.bal.value) || 0;
  return { ok: !!ev.success, add: price, newBalance: ev.success ? cur + price : cur };
}`
repo.save({
  id: 'shop-sell-credit', name: 'Loja: creditar venda', enabled: true,
  nodes: [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'item_removed', alias: 'rem' } },
    { id: 'bal', type: 'memory', position: { x: 200, y: 0 }, data: { action: 'read', alias: 'bal', params: { key: 'coins:{{rem.userid}}', flow: 'shop-buy' } } },
    { id: 'calc', type: 'action', position: { x: 400, y: 0 }, data: { action_type: 'script', alias: 'calc', params: { code: CREDIT_CODE } } },
    { id: 'cond', type: 'condition', position: { x: 600, y: 0 }, data: { field: '{{calc.ok}}', operator: 'equals', value: 'true' } },
    { id: 'save', type: 'memory', position: { x: 800, y: -40 }, data: { action: 'write', params: { key: 'coins:{{rem.userid}}', value: '{{calc.newBalance}}', flow: 'shop-buy' } } },
    { id: 'msg', type: 'action', position: { x: 800, y: 60 }, data: { action_type: 'ui_notification', params: { userid: '{{rem.userid}}', text: 'Vendeu {{rem.removed}}x {{rem.prefab}} (+{{calc.add}})! Saldo: {{calc.newBalance}}', duration: '5' } } },
  ],
  edges: [
    { id: 'e1', source: 'trg', target: 'bal' },
    { id: 'e2', source: 'bal', target: 'calc' },
    { id: 'e3', source: 'calc', target: 'cond' },
    { id: 'e4', source: 'cond', target: 'save', sourceHandle: 'true' },
    { id: 'e5', source: 'cond', target: 'msg', sourceHandle: 'true' },
  ],
})

new FlowMemoryRepository(server).set('shop-buy', `coins:${USER}`, 10)

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: USER, name: 'S' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const got: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); got.push(...(r.commands || [])) } return got }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

await sync([]); await sleep(300)

// 1) click "sell_log" → expect a remove_item command for prefab log
await sync([{ type: 'ui_callback', data: { userid: USER, name: 'S', callback: 'sell_log', callback_name: 'sell_log' } }])
const afterClick = await drain()
const rm = afterClick.find(c => c.type === 'remove_item')
ck(!!rm && rm.data?.prefab === 'log' && rm.data?.count === 1, `remove_item log x1 emitido [got ${JSON.stringify(rm?.data && { prefab: rm.data.prefab, count: rm.data.count, token: rm.data.token })}]`)
ck(rm?.data?.token === 3, `token=preço(3) propagado [got ${rm?.data?.token}]`)

// 2) mod confirms removal → inject item_removed success; expect credit 10→13
await sync([{ type: 'item_removed', data: { userid: USER, prefab: 'log', requested: 1, removed: 1, success: true, token: 3 } }])
const afterCredit = await drain()
const bal1 = new FlowMemoryRepository(server).get('shop-buy', `coins:${USER}`)
ck(Number(bal1) === 13, `venda creditou 10→13 [got ${bal1}]`)
ck(afterCredit.some(c => c.type === 'ui_command' && /Vendeu/.test(c.data?.cmd?.text || '')), 'notificação de venda enviada')

// 3) a FAILED removal must NOT credit
await sync([{ type: 'item_removed', data: { userid: USER, prefab: 'gears', requested: 1, removed: 0, success: false, token: 30 } }])
await drain()
const bal2 = new FlowMemoryRepository(server).get('shop-buy', `coins:${USER}`)
ck(Number(bal2) === 13, `remoção falha NÃO credita (saldo 13) [got ${bal2}]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
