#!/usr/bin/env bun
// End-to-end test of the ui_menu shop on a sim server:
//   1) chat "#loja" → ui_command with action 'batch' (panel + 3 buttons)
//   2) ui_callback buy_log with balance 30 → give_item(log x10) + ui_notification, saldo vira 25
//   3) ui_callback buy_gears (price 50) with balance 25 → NO give_item, "saldo insuficiente"
//
// Re-seeds the shop flows, sets an initial balance, then drives the sync API.

import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'
import { seedShop } from './seed-shop.ts'

const server = 'sim-shop'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_shop'

// Re-seed the flows (idempotent) into THIS server.
seedShop(server)

// Give the player a starting balance of 30 coins (memory is per-flow: shop-buy).
new FlowMemoryRepository(server).set('shop-buy', `coins:${USER}`, 30)

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server_id: server, shard_id: `${server}:master`, shard_type: 'master',
    server: { name: server, phase: 'day' },
    players: [{ userid: USER, name: 'Shopper', health: { current: 100, max: 150 } }],
    events,
  }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const got: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); got.push(...(r.commands || [])) } return got }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

// register the server
await sync([]); await sleep(300)

// 1) open the shop
await sync([{ type: 'chat_message', data: { userid: USER, name: 'Shopper', message: '#loja' } }])
const open = await drain()
const menuCmd = open.find(c => c.type === 'ui_command' && c.data?.cmd?.action === 'batch')
ck(!!menuCmd, 'abrir: ui_command batch enviado')
const sub = menuCmd?.data?.cmd?.commands || []
ck(sub.some((s: any) => s.type === 'panel'), 'abrir: batch contém panel')
const btns = sub.filter((s: any) => s.type === 'button')
ck(btns.length === 3, `abrir: batch contém 3 botões [got ${btns.length}]`)
ck(btns.some((b: any) => b.callback === 'buy_log'), 'abrir: botão buy_log com callback correto')

// 2) buy log (price 5) with balance 30 → success, saldo 25
await sync([{ type: 'ui_callback', data: { userid: USER, name: 'Shopper', callback: 'buy_log', callback_name: 'buy_log', widget_id: 'loja_btn_0' } }])
const buy1 = await drain()
const give = buy1.find(c => c.type === 'give_item')
ck(!!give && give.data?.prefab === 'log' && give.data?.count === 10, `comprar log: give_item log x10 [got ${JSON.stringify(give?.data)}]`)
ck(buy1.some(c => c.type === 'ui_command' && /Comprou/.test(c.data?.cmd?.text || '')), 'comprar log: notificação de sucesso')
const balAfter = new FlowMemoryRepository(server).get('shop-buy', `coins:${USER}`)
ck(Number(balAfter) === 25, `comprar log: saldo debitado 30→25 [got ${balAfter}]`)

// 3) buy gears (price 50) with balance 25 → fail
await sync([{ type: 'ui_callback', data: { userid: USER, name: 'Shopper', callback: 'buy_gears', callback_name: 'buy_gears', widget_id: 'loja_btn_2' } }])
const buy2 = await drain()
ck(!buy2.some(c => c.type === 'give_item'), 'comprar gears (sem saldo): nenhum give_item')
ck(buy2.some(c => c.type === 'ui_command' && /insuficiente/i.test(c.data?.cmd?.text || '')), 'comprar gears: notificação de saldo insuficiente')
const balUnchanged = new FlowMemoryRepository(server).get('shop-buy', `coins:${USER}`)
ck(Number(balUnchanged) === 25, `comprar gears: saldo inalterado (25) [got ${balUnchanged}]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
