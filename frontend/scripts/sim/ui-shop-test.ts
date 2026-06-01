#!/usr/bin/env bun
// Validates the seed-ui-shop subgraph composes the right tree on #loja:
// panel(Loja) > col > 3 rows, each row = icon + text + button(buy_*).

import { seedUIShop } from './seed-ui-shop.ts'
import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'

const server = 'sim-uishop'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_uishop'

seedUIShop(server)
// saldo inicial no namespace do shop-buy (de onde a loja-open lê via flow override)
new FlowMemoryRepository(server).set('shop-buy', `coins:${USER}`, 73)

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ server_id: server, shard_id: `${server}:master`, shard_type: 'master', server: { name: server, phase: 'day' }, players: [{ userid: USER, name: 'U' }], events }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const got: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); got.push(...(r.commands || [])) } return got }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

await sync([]); await sleep(300)
await sync([{ type: 'chat_message', data: { userid: USER, name: 'U', message: '#loja' } }])
const got = await drain()
const tree = got.find(c => c.type === 'ui_command' && c.data?.cmd?.type === 'tree')?.data?.cmd?.tree
ck(!!tree, `árvore emitida [tipos: ${[...new Set(got.map(c => c.type))].join(',') || 'nenhum'}]`)
ck(tree?.type === 'panel' && tree?.title === 'Loja', 'raiz panel Loja')
const col = tree?.children?.[0]
const rows = (col?.children || []).filter((c: any) => c.type === 'row')
ck(col?.type === 'col' && rows.length === 3, `col com 3 rows [got ${rows.length} rows de ${col?.children?.length} filhos]`)
let okRows = true
const cbs: string[] = []
for (const r of rows) {
  const types = (r.children || []).map((c: any) => c.type)
  if (!(types.includes('icon') && types.includes('text') && types.includes('button'))) okRows = false
  const btn = (r.children || []).find((c: any) => c.type === 'button')
  if (btn) cbs.push(btn.callback)
}
ck(okRows, 'cada row tem icon+text+button')
ck(cbs.includes('buy_log') && cbs.includes('buy_meat') && cbs.includes('buy_gears'), `callbacks: ${cbs.join(',')}`)
const firstIcon = rows[0]?.children?.find((c: any) => c.type === 'icon')
ck(!!firstIcon?.prefab, `primeiro item tem prefab [${firstIcon?.prefab}]`)
// saldo: primeiro filho da coluna deve ser o texto de moedas com o valor lido
const saldoTxt = col?.children?.find((c: any) => c.type === 'text' && /moedas/i.test(c.text || ''))
ck(saldoTxt?.text === 'Suas moedas: 73', `saldo exibido [got "${saldoTxt?.text}"]`)
ck(saldoTxt?.id === 'saldo_txt', `saldo é endereçável (id=saldo_txt) [got ${saldoTxt?.id}]`)

// comprar log (5) → saldo 73→68, e um set_text deve ser emitido para 'loja'/'saldo_txt'
await sync([{ type: 'ui_callback', data: { userid: USER, name: 'U', callback: 'buy_log', callback_name: 'buy_log', widget_id: 'loja' } }])
const buy = await drain()
const setTxt = buy.find(c => c.type === 'ui_command' && c.data?.cmd?.action === 'set_text')
ck(!!setTxt, `set_text emitido após compra [tipos: ${[...new Set(buy.map(c => c.type))].join(',')}]`)
ck(setTxt?.data?.cmd?.id === 'loja' && setTxt?.data?.cmd?.node === 'saldo_txt', `set_text alvo loja/saldo_txt [got ${setTxt?.data?.cmd?.id}/${setTxt?.data?.cmd?.node}]`)
ck(setTxt?.data?.cmd?.text === 'Suas moedas: 68', `set_text com saldo novo 68 [got "${setTxt?.data?.cmd?.text}"]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
