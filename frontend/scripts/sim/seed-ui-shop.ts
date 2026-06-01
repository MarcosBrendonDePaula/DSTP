#!/usr/bin/env bun
// "Loja com ícones" — UI composta por nodes. Abre com #loja e tem duas seções:
//   COMPRAR: ícone + nome/preço + botão (callback buy_<prefab>)  → flow shop-buy
//   VENDER:  ícone + preço de venda + botão (callback sell_<prefab>) → flows de venda
// Mostra o saldo no topo e o atualiza in loco a cada compra/venda.
//
// Usage: bun run scripts/sim/seed-ui-shop.ts [serverId]

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
import { CATALOG, seedShop } from './seed-shop.ts'

// Preço de venda por prefab (menor que a compra → sem exploit de revenda).
const SELL_PRICE: Record<string, number> = { log: 3, meat: 12, gears: 30 }

export function seedUIShop(serverId: string) {
  const repo = new FlowRepository(serverId)

  // Cria shop-buy (compra) + shop-sell/shop-sell-credit (venda).
  seedShop(serverId)
  seedSellFlows(serverId)

  // ── Subgrafo da UI ────────────────────────────────────────
  //   panel > col > [ saldo, tabs > [ colComprar, colVender ] ]
  // Cada coluna de aba tem tab_label; o renderer mostra uma de cada vez.
  const nodes: any[] = [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
    { id: 'cond', type: 'condition', position: { x: 110, y: 0 }, data: { field: '{{tm.message}}', operator: 'contains', value: 'loja' } },
    { id: 'bal', type: 'memory', position: { x: 160, y: 0 }, data: { action: 'read', alias: 'bal', params: { key: 'coins:{{tm.userid}}', flow: 'shop-buy' } } },
    { id: 'panel', type: 'ui_panel', position: { x: 220, y: 0 }, data: { params: { id: 'loja', userid: '{{tm.userid}}', title: 'Loja', anchor: 'center', gap: '8' } } },
    { id: 'col', type: 'ui_col', position: { x: 440, y: 0 }, data: { params: { gap: '8' } } },
    { id: 'saldo', type: 'ui_text', position: { x: 660, y: -400 }, data: { params: { text: 'Suas moedas: {{bal.value}}', node_id: 'saldo_txt', size: '20', color: '[1,0.9,0.4,1]' } } },
    { id: 'tabs', type: 'ui_tabs', position: { x: 660, y: -300 }, data: { params: { active: '0' } } },
    { id: 'tab_buy', type: 'ui_col', position: { x: 880, y: -350 }, data: { params: { gap: '6', tab_label: 'Comprar' } } },
    { id: 'tab_sell', type: 'ui_col', position: { x: 880, y: -250 }, data: { params: { gap: '6', tab_label: 'Vender' } } },
  ]
  const edges: any[] = [
    { id: 'e_trg', source: 'trg', target: 'cond' },
    { id: 'e_cb', source: 'cond', target: 'bal', sourceHandle: 'true' },
    { id: 'e_bp', source: 'bal', target: 'panel' },
    { id: 'e_pc', source: 'panel', target: 'col' },
    { id: 'e_saldo', source: 'col', target: 'saldo' },
    { id: 'e_tabs', source: 'col', target: 'tabs' },
    { id: 'e_tabbuy', source: 'tabs', target: 'tab_buy' },   // aba 0 (Comprar, y menor)
    { id: 'e_tabsell', source: 'tabs', target: 'tab_sell' }, // aba 1 (Vender)
  ]

  // Cada linha entra na coluna da sua aba.
  const yByTab: Record<string, number> = { tab_buy: 0, tab_sell: 0 }
  const addRow = (tabCol: 'tab_buy' | 'tab_sell', kind: 'buy' | 'sell', prefab: string, nome: string, price: number) => {
    const rowId = `${kind}_${prefab}`
    const cb = `${kind}_${prefab}`
    const y = yByTab[tabCol]; yByTab[tabCol] += 60
    nodes.push({ id: rowId, type: 'ui_row', position: { x: 1100, y }, data: { params: { gap: '12' } } })
    edges.push({ id: `e_col_${rowId}`, source: tabCol, target: rowId })
    nodes.push({ id: `${rowId}_icon`, type: 'ui_icon', position: { x: 1320, y }, data: { params: { prefab, size: '48' } } })
    nodes.push({ id: `${rowId}_txt`, type: 'ui_text', position: { x: 1480, y }, data: { params: { text: `${nome}  (${price})`, size: '16' } } })
    nodes.push({ id: `${rowId}_btn`, type: 'ui_button', position: { x: 1680, y }, data: { params: { text: kind === 'buy' ? 'Comprar' : 'Vender', callback: cb, width: '110' } } })
    edges.push({ id: `e_${rowId}_i`, source: rowId, target: `${rowId}_icon` })
    edges.push({ id: `e_${rowId}_t`, source: rowId, target: `${rowId}_txt` })
    edges.push({ id: `e_${rowId}_b`, source: rowId, target: `${rowId}_btn` })
  }

  for (const item of Object.values(CATALOG)) addRow('tab_buy', 'buy', item.prefab, item.nome, item.price)
  for (const [prefab, price] of Object.entries(SELL_PRICE)) {
    const nome = Object.values(CATALOG).find(c => c.prefab === prefab)?.nome || prefab
    addRow('tab_sell', 'sell', prefab, nome, price)
  }

  repo.delete('shop-open')
  repo.save({ id: 'shop-open-ui', name: 'Loja UI (#loja)', enabled: true, nodes, edges })
}

// Flows de venda: clique sell_<prefab> → remove_item; item_removed(success) → credita.
function seedSellFlows(serverId: string) {
  const repo = new FlowRepository(serverId)

  const SELL_CODE = `async function run(context) {
    const sell = ${JSON.stringify(SELL_PRICE)};
    const cb = context.trigger.callback || context.trigger.callback_name;
    const prefab = String(cb || '').replace(/^sell_/, '');
    const price = sell[prefab];
    if (price == null) return { found: false };
    return { found: true, prefab, price };
  }`

  // Só reage a callbacks de venda (sell_*).
  repo.save({
    id: 'shop-sell', name: 'Loja: vender (clique)', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'ui_callback', alias: 'click' } },
      { id: 'it', type: 'action', position: { x: 200, y: 0 }, data: { action_type: 'script', alias: 'it', params: { code: SELL_CODE } } },
      { id: 'cond', type: 'condition', position: { x: 400, y: 0 }, data: { field: '{{it.found}}', operator: 'equals', value: 'true' } },
      // token carrega o preço para o flow de crédito saber quanto pagar
      { id: 'rem', type: 'action', position: { x: 600, y: 0 }, data: { action_type: 'remove_item', params: { userid: '{{click.userid}}', prefab: '{{it.prefab}}', count: '1', token: '{{it.price}}' } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'it' },
      { id: 'e2', source: 'it', target: 'cond' },
      { id: 'e3', source: 'cond', target: 'rem', sourceHandle: 'true' },
    ],
  })

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
      { id: 'save', type: 'memory', position: { x: 800, y: -60 }, data: { action: 'write', params: { key: 'coins:{{rem.userid}}', value: '{{calc.newBalance}}', flow: 'shop-buy' } } },
      { id: 'msg', type: 'action', position: { x: 800, y: 20 }, data: { action_type: 'ui_notification', params: { userid: '{{rem.userid}}', text: 'Vendeu {{rem.removed}}x {{rem.prefab}} (+{{calc.add}})! Saldo: {{calc.newBalance}}', duration: '5' } } },
      // atualiza o saldo na loja aberta
      { id: 'setbal', type: 'action', position: { x: 800, y: 100 }, data: { action_type: 'ui_set_text', params: { userid: '{{rem.userid}}', id: 'loja', node: 'saldo_txt', text: 'Suas moedas: {{calc.newBalance}}' } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'bal' },
      { id: 'e2', source: 'bal', target: 'calc' },
      { id: 'e3', source: 'calc', target: 'cond' },
      { id: 'e4', source: 'cond', target: 'save', sourceHandle: 'true' },
      { id: 'e5', source: 'cond', target: 'msg', sourceHandle: 'true' },
      { id: 'e6', source: 'cond', target: 'setbal', sourceHandle: 'true' },
    ],
  })
}

if (import.meta.main) {
  const serverId = process.argv[2] ?? 'sim-uishop'
  seedUIShop(serverId)
  console.log(`Loja UI (comprar+vender) criada em "${serverId}"`)
  process.exit(0)
}
