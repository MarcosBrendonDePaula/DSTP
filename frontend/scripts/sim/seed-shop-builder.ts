#!/usr/bin/env bun
// Loja montada com UM node UI Builder (árvore dentro do node), em vez de ~25
// nodes ui_* soltos. Mesmos flows de compra/venda; só a tela é um ui_builder.
// Desabilita a loja antiga (shop-open-ui) e ativa esta (shop-builder).
//
// Usage: bun run scripts/sim/seed-shop-builder.ts [serverId]

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
import { CATALOG, seedShop } from './seed-shop.ts'

const SELL_PRICE: Record<string, number> = { log: 3, meat: 12, gears: 30 }

function buyRow(prefab: string, nome: string, price: number) {
  return { type: 'row', gap: 12, children: [
    { type: 'icon', prefab, size: 48 },
    { type: 'text', text: `${nome}  (${price})`, size: 16 },
    { type: 'button', text: 'Comprar', callback: `buy_${prefab}`, width: 110 },
  ]}
}
function sellRow(prefab: string, nome: string, price: number) {
  return { type: 'row', gap: 12, children: [
    { type: 'icon', prefab, size: 48 },
    { type: 'text', text: `${nome}  (${price})`, size: 16 },
    { type: 'button', text: 'Vender', callback: `sell_${prefab}`, width: 110 },
  ]}
}

export function seedShopBuilder(serverId: string) {
  const repo = new FlowRepository(serverId)
  seedShop(serverId) // garante shop-buy + (re)cria shop-open antigo; desligamos abaixo

  const buyRows = Object.values(CATALOG).map(it => buyRow(it.prefab, it.nome, it.price))
  const sellRows = Object.entries(SELL_PRICE).map(([prefab, price]) => {
    const nome = Object.values(CATALOG).find(c => c.prefab === prefab)?.nome || prefab
    return sellRow(prefab, nome, price)
  })

  // A loja inteira como UMA árvore dentro de um ui_builder.
  const tree = {
    type: 'panel', title: 'Loja', gap: 8,
    children: [
      { type: 'text', id: 'saldo_txt', text: 'Suas moedas: {{bal.value}}', size: 20, color: [1, 0.9, 0.4, 1] },
      { type: 'tabs', active: 0, tabs: [
        { label: 'Comprar', child: { type: 'col', gap: 6, children: buyRows } },
        { label: 'Vender', child: { type: 'col', gap: 6, children: sellRows } },
      ]},
    ],
  }

  repo.save({
    id: 'shop-builder', name: 'Loja (UI Builder)', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
      { id: 'cond', type: 'condition', position: { x: 200, y: 0 }, data: { field: '{{tm.message}}', operator: 'contains', value: 'loja' } },
      { id: 'bal', type: 'memory', position: { x: 400, y: 0 }, data: { action: 'read', alias: 'bal', params: { key: 'coins:{{tm.userid}}', flow: 'shop-buy' } } },
      { id: 'ui', type: 'ui_builder', position: { x: 600, y: 0 }, data: { tree, params: { id: 'loja', userid: '{{tm.userid}}' } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'cond' },
      { id: 'e2', source: 'cond', target: 'bal', sourceHandle: 'true' },
      { id: 'e3', source: 'bal', target: 'ui' },
    ],
  })

  // Desabilita a loja antiga (nodes soltos), mantém a nova.
  repo.toggle('shop-open-ui', false)
  repo.toggle('shop-builder', true)
}

if (import.meta.main) {
  const serverId = process.argv[2] ?? 'sim-builder2'
  seedShopBuilder(serverId)
  console.log(`Loja UI Builder criada em "${serverId}" (shop-builder ativo, shop-open-ui desativado)`)
  process.exit(0)
}
