#!/usr/bin/env bun
// Validates the "quantidade em inventário" on the shop: opening it emits a
// dump_inventory command, and an incoming inventory_dump event (which the mod
// would emit) fills "tem: N" via ui_set on each have_<kind>_<prefab> node.

import { seedShopBuilder } from './seed-shop-builder.ts'
import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'

const server = 'sim-invqty'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_iq'

seedShopBuilder(server)
new FlowMemoryRepository(server).set('shop-buy', `coins:${USER}`, 50)

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: USER, name: 'Q' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const g: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); g.push(...(r.commands || [])) } return g }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

await sync([]); await sleep(300)

// 1) open shop → expect a dump_inventory command
await sync([{ type: 'chat_message', data: { userid: USER, name: 'Q', message: '#loja' } }])
const open = await drain()
ck(open.some(c => c.type === 'dump_inventory'), `dump_inventory pedido ao abrir [${[...new Set(open.map(c => c.type))].join(',')}]`)

// 2) mod responds with inventory_dump → expect ui_set on have_buy_log / have_sell_log
await sync([{ type: 'inventory_dump', data: { userid: USER, items: { log: 18, gears: 2 } } }])
const after = await drain()
const sets = after.filter(c => c.type === 'ui_command' && c.data?.cmd?.action === 'set')
const byNode = (n: string) => sets.find(c => c.data?.cmd?.node === n)?.data?.cmd?.props?.text
ck(sets.length >= 2, `ui_set emitidos do inventory_dump [${sets.length}]`)
ck(byNode('have_buy_log') === 'tem: 18', `compra log mostra tem: 18 [${byNode('have_buy_log')}]`)
ck(byNode('have_sell_log') === 'tem: 18', `venda log mostra tem: 18 [${byNode('have_sell_log')}]`)
ck(byNode('have_buy_gears') === 'tem: 2', `compra gears mostra tem: 2 [${byNode('have_buy_gears')}]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
