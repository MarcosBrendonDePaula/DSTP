#!/usr/bin/env bun
// "Loja com ícones" — UI composta por nodes (panel > col > rows[icon,text,button]).
// Abre com #loja; cada linha mostra o ícone real do item + nome + preço + botão.
// O clique volta como ui_callback e o flow shop-buy (moeda virtual) processa a compra.
//
// Usage: bun run scripts/sim/seed-ui-shop.ts [serverId]
// Or import { seedUIShop } and call inline.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
import { CATALOG } from './seed-shop.ts' // reusa o catálogo e o flow shop-buy
import { seedShop } from './seed-shop.ts'

export function seedUIShop(serverId: string) {
  const repo = new FlowRepository(serverId)

  // Reusa o flow de compra (shop-buy) — moeda virtual, find item pelo callback.
  seedShop(serverId) // cria shop-open(antigo, menu texto) + shop-buy. Vamos sobrescrever shop-open abaixo.

  // Monta o subgrafo da UI:
  //   trigger #loja → cond(loja) → memory.read(saldo) → panel → col → [saldo, rows...]
  const nodes: any[] = [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
    { id: 'cond', type: 'condition', position: { x: 110, y: 0 }, data: { field: '{{tm.message}}', operator: 'contains', value: 'loja' } },
    // Lê o saldo no namespace do shop-buy (flow override) — assim a loja mostra
    // o mesmo saldo que o flow de compra debita.
    { id: 'bal', type: 'memory', position: { x: 160, y: 0 }, data: { action: 'read', alias: 'bal', params: { key: 'coins:{{tm.userid}}', flow: 'shop-buy' } } },
    { id: 'panel', type: 'ui_panel', position: { x: 220, y: 0 }, data: { params: { id: 'loja', userid: '{{tm.userid}}', title: 'Loja', anchor: 'center', gap: '10' } } },
    { id: 'col', type: 'ui_col', position: { x: 440, y: 0 }, data: { params: { gap: '10' } } },
    // saldo no topo (Y menor que as rows → aparece primeiro na coluna)
    { id: 'saldo', type: 'ui_text', position: { x: 660, y: -200 }, data: { params: { text: 'Suas moedas: {{bal.value}}', node_id: 'saldo_txt', size: '20', color: '[1,0.9,0.4,1]' } } },
  ]
  const edges: any[] = [
    { id: 'e_trg', source: 'trg', target: 'cond' },
    { id: 'e_cb', source: 'cond', target: 'bal', sourceHandle: 'true' },
    { id: 'e_bp', source: 'bal', target: 'panel' },
    { id: 'e_pc', source: 'panel', target: 'col' },
    { id: 'e_saldo', source: 'col', target: 'saldo' },
  ]

  // Uma linha por item do catálogo, empilhadas por Y crescente (após o saldo).
  let rowY = 0
  let i = 0
  for (const [cb, item] of Object.entries(CATALOG)) {
    const rowId = `row_${i}`
    nodes.push({ id: rowId, type: 'ui_row', position: { x: 660, y: rowY }, data: { params: { gap: '12' } } })
    edges.push({ id: `e_col_${i}`, source: 'col', target: rowId })

    // filhos da linha, ordenados por X: icon → text → button
    nodes.push({ id: `${rowId}_icon`, type: 'ui_icon', position: { x: 880, y: rowY }, data: { params: { prefab: item.prefab, size: '52' } } })
    nodes.push({ id: `${rowId}_txt`, type: 'ui_text', position: { x: 1040, y: rowY }, data: { params: { text: `${item.nome}  (${item.price})`, size: '18' } } })
    nodes.push({ id: `${rowId}_btn`, type: 'ui_button', position: { x: 1240, y: rowY }, data: { params: { text: 'Comprar', callback: cb, width: '120' } } })
    edges.push({ id: `e_${rowId}_i`, source: rowId, target: `${rowId}_icon` })
    edges.push({ id: `e_${rowId}_t`, source: rowId, target: `${rowId}_txt` })
    edges.push({ id: `e_${rowId}_b`, source: rowId, target: `${rowId}_btn` })

    rowY += 120
    i++
  }

  // Substitui o shop-open (versão menu-texto) pela versão UI-por-nodes.
  repo.delete('shop-open')
  repo.save({ id: 'shop-open-ui', name: 'Loja UI (#loja)', enabled: true, nodes, edges })
}

if (import.meta.main) {
  const serverId = process.argv[2] ?? 'sim-uishop'
  seedUIShop(serverId)
  console.log(`Loja UI (ícones) criada em "${serverId}": shop-open-ui + shop-buy`)
  process.exit(0)
}
