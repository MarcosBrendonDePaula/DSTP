#!/usr/bin/env bun
// Loja montada com UM node UI Builder (árvore dentro do node), em vez de ~25
// nodes ui_* soltos. Mesmos flows de compra/venda; só a tela é um ui_builder.
// Desabilita a loja antiga (shop-open-ui) e ativa esta (shop-builder).
//
// Usage: bun run scripts/sim/seed-shop-builder.ts [serverId]

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
import { CATALOG, seedShop } from './seed-shop.ts'
import { seedSellFlows } from './seed-ui-shop.ts'

const SELL_PRICE: Record<string, number> = { log: 3, meat: 12, gears: 30 }

function buyRow(prefab: string, nome: string, price: number) {
  return { type: 'row', gap: 12, children: [
    { type: 'icon', prefab, size: 48 },
    { type: 'text', text: `${nome}  (${price})`, size: 16 },
    { type: 'text', id: `have_buy_${prefab}`, text: 'tem: 0', size: 13, color: [0.7, 0.8, 0.7, 1] },
    { type: 'button', text: 'Comprar', callback: `buy_${prefab}`, width: 110 },
  ]}
}
function sellRow(prefab: string, nome: string, price: number) {
  return { type: 'row', gap: 12, children: [
    { type: 'icon', prefab, size: 48 },
    { type: 'text', text: `${nome}  (${price})`, size: 16 },
    { type: 'text', id: `have_sell_${prefab}`, text: 'tem: 0', size: 13, color: [0.7, 0.8, 0.7, 1] },
    { type: 'button', text: 'Vender', callback: `sell_${prefab}`, width: 110 },
  ]}
}

export function seedShopBuilder(serverId: string) {
  const repo = new FlowRepository(serverId)
  seedShop(serverId)       // shop-buy (compra)
  seedSellFlows(serverId)  // shop-sell + shop-sell-credit (venda)

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
      // pede o inventário; o resultado (inventory_dump) preenche os "tem: N"
      { id: 'dump', type: 'action', position: { x: 800, y: 0 }, data: { action_type: 'dump_inventory', params: { userid: '{{tm.userid}}' } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'cond' },
      { id: 'e2', source: 'cond', target: 'bal', sourceHandle: 'true' },
      { id: 'e3', source: 'bal', target: 'ui' },
      { id: 'e4', source: 'ui', target: 'dump' },
    ],
  })

  // Flow que reage ao inventory_dump e preenche "tem: N" em cada item (buy+sell).
  const prefabs = Array.from(new Set([...Object.values(CATALOG).map(c => c.prefab), ...Object.keys(SELL_PRICE)]))
  const invNodes: any[] = [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'inventory_dump', alias: 'dump' } },
  ]
  const invEdges: any[] = []
  let y = -120
  prefabs.forEach((prefab, i) => {
    for (const kind of ['buy', 'sell']) {
      const nid = `set_${kind}_${prefab}`
      invNodes.push({ id: nid, type: 'action', position: { x: 240, y }, data: { action_type: 'ui_set', params: {
        userid: '{{dump.userid}}', id: 'loja', node: `have_${kind}_${prefab}`, text: `tem: {{dump.items.${prefab}}}`,
      } } })
      invEdges.push({ id: `e_${nid}`, source: 'trg', target: nid })
      y += 50
    }
  })
  repo.save({ id: 'shop-inv', name: 'Loja: preencher inventário', enabled: true, nodes: invNodes, edges: invEdges })

  // Desabilita a loja antiga (nodes soltos), mantém as novas.
  repo.toggle('shop-open-ui', false)
  repo.toggle('shop-builder', true)
  repo.toggle('shop-inv', true)
  repo.toggle('shop-sell', true)
  repo.toggle('shop-sell-credit', true)
}

if (import.meta.main) {
  const serverId = process.argv[2] ?? 'sim-builder2'
  seedShopBuilder(serverId)
  console.log(`Loja UI Builder criada em "${serverId}" (shop-builder ativo, shop-open-ui desativado)`)
  process.exit(0)
}
