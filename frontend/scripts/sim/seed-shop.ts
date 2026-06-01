#!/usr/bin/env bun
// "Lojinha (moeda virtual)" — abre um menu via #loja; cada botão é um item.
// O clique volta como ui_callback; o flow de compra lê o saldo (memory),
// verifica, debita e entrega o item.
//
//   chat "#loja" → ui_menu(panel + botões)
//   ui_callback  → script(resolve item+preço) → memory.read saldo
//                  → script(afford) → condition(ok) → [debita + give_item + notifica]
//                                                    → [notifica "saldo insuficiente"]
//
// Usage: bun run scripts/sim/seed-shop.ts [serverId]
// Or import { seedShop } and call inline (no process hang).

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

// Catálogo: callback do botão → { prefab, preço, qtd, nome }
export const CATALOG: Record<string, { prefab: string; price: number; count: number; nome: string }> = {
  buy_log:   { prefab: 'log',   price: 5,  count: 10, nome: 'Madeira x10' },
  buy_meat:  { prefab: 'meat',  price: 20, count: 1,  nome: 'Carne' },
  buy_gears: { prefab: 'gears', price: 50, count: 1,  nome: 'Engrenagem' },
}

const BUTTONS = Object.entries(CATALOG).map(([cb, it]) => ({
  label: `${it.nome} - ${it.price} moedas`, callback: cb,
}))

const RESOLVE_CODE = `async function run(context) {
  const catalog = ${JSON.stringify(CATALOG)};
  const cb = context.trigger.callback || context.trigger.callback_name;
  const item = catalog[cb];
  if (!item) return { found: false };
  return { found: true, prefab: item.prefab, price: item.price, count: item.count, nome: item.nome };
}`

const AFFORD_CODE = `async function run(context) {
  const balance = Number(context.bal && context.bal.value) || 0;
  const price = Number(context.item && context.item.price) || 0;
  const ok = balance >= price;
  return { balance, price, ok, newBalance: ok ? balance - price : balance };
}`

export function seedShop(serverId: string) {
  const repo = new FlowRepository(serverId)

  // ── Flow 1: abrir a loja ───────────────────────────────────
  repo.save({
    id: 'shop-open',
    name: 'Loja: abrir (#loja)',
    enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
      { id: 'cond', type: 'condition', position: { x: 220, y: 0 }, data: { field: '{{tm.message}}', operator: 'contains', value: 'loja' } },
      {
        id: 'menu', type: 'ui_menu', position: { x: 440, y: 0 },
        data: {
          action_type: 'ui_menu',
          buttons: BUTTONS,
          params: {
            userid: '{{tm.userid}}', id: 'loja', title: 'Loja', body: 'Escolha um item',
            buttons: JSON.stringify(BUTTONS),
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'cond' },
      { id: 'e2', source: 'cond', target: 'menu', sourceHandle: 'true' },
    ],
  })

  // ── Flow 2: comprar (clique no botão) ──────────────────────
  repo.save({
    id: 'shop-buy',
    name: 'Loja: comprar',
    enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'ui_callback', alias: 'click' } },
      { id: 'item', type: 'action', position: { x: 200, y: 0 }, data: { action_type: 'script', alias: 'item', params: { code: RESOLVE_CODE } } },
      // Só segue se o callback for um item de COMPRA (ignora sell_* etc).
      { id: 'found', type: 'condition', position: { x: 300, y: 0 }, data: { field: '{{item.found}}', operator: 'equals', value: 'true' } },
      { id: 'bal', type: 'memory', position: { x: 400, y: 0 }, data: { action: 'read', alias: 'bal', params: { key: 'coins:{{click.userid}}' } } },
      { id: 'afford', type: 'action', position: { x: 600, y: 0 }, data: { action_type: 'script', alias: 'afford', params: { code: AFFORD_CODE } } },
      { id: 'cond', type: 'condition', position: { x: 800, y: 0 }, data: { field: '{{afford.ok}}', operator: 'equals', value: 'true' } },
      { id: 'debit', type: 'memory', position: { x: 1020, y: -80 }, data: { action: 'write', params: { key: 'coins:{{click.userid}}', value: '{{afford.newBalance}}' } } },
      { id: 'give', type: 'action', position: { x: 1020, y: 0 }, data: { action_type: 'give_item', params: { userid: '{{click.userid}}', prefab: '{{item.prefab}}', count: '{{item.count}}' } } },
      { id: 'okmsg', type: 'action', position: { x: 1020, y: 80 }, data: { action_type: 'ui_notification', params: { userid: '{{click.userid}}', text: 'Comprou {{item.nome}}! Saldo: {{afford.newBalance}}', duration: '5' } } },
      // Atualiza o saldo na loja aberta, em loco (no-op se a loja não estiver aberta).
      { id: 'setbal', type: 'action', position: { x: 1020, y: 280 }, data: { action_type: 'ui_set_text', params: { userid: '{{click.userid}}', id: 'loja', node: 'saldo_txt', text: 'Suas moedas: {{afford.newBalance}}' } } },
      { id: 'nomsg', type: 'action', position: { x: 1020, y: 180 }, data: { action_type: 'ui_notification', params: { userid: '{{click.userid}}', text: 'Saldo insuficiente para {{item.nome}} (tem {{afford.balance}}, custa {{item.price}})', duration: '5' } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'item' },
      { id: 'e2', source: 'item', target: 'found' },
      { id: 'ef', source: 'found', target: 'bal', sourceHandle: 'true' },
      { id: 'e3', source: 'bal', target: 'afford' },
      { id: 'e4', source: 'afford', target: 'cond' },
      { id: 'e5', source: 'cond', target: 'debit', sourceHandle: 'true' },
      { id: 'e6', source: 'cond', target: 'give', sourceHandle: 'true' },
      { id: 'e7', source: 'cond', target: 'okmsg', sourceHandle: 'true' },
      { id: 'e9', source: 'cond', target: 'setbal', sourceHandle: 'true' },
      { id: 'e8', source: 'cond', target: 'nomsg', sourceHandle: 'false' },
    ],
  })
}

// Run standalone: `bun run scripts/sim/seed-shop.ts [serverId]`
if (import.meta.main) {
  const serverId = process.argv[2] ?? 'sim-shop'
  seedShop(serverId)
  console.log(`Lojinha criada em "${serverId}": flows shop-open + shop-buy`)
  process.exit(0)
}
