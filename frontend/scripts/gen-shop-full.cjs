// Generates the full shop in a single flow (trigger ui_callback). Buy/sell items,
// a live wallet, tabs (Comprar/Vender) and a Buy tab that changes per season.
// Run: node scripts/gen-shop-full.cjs  → examples/flows/shop/shop-full.dstp.json
const fs = require('fs')
const path = require('path')

// Buy catalog per season: [prefab, label, price].
const BUY = {
  autumn: [['carrot', 'Cenoura', 5], ['berries', 'Frutas', 5], ['axe', 'Machado', 20], ['spear', 'Lanca', 30]],
  winter: [['earmuffshat', 'Orelheira', 25], ['heatrock', 'Pedra Termica', 50], ['meat', 'Carne', 15], ['torch', 'Tocha', 10]],
  spring: [['umbrella', 'Guarda-chuva', 35], ['strawhat', 'Chapeu de Palha', 15], ['seeds', 'Sementes', 5], ['spear', 'Lanca', 30]],
  summer: [['umbrella', 'Guarda-chuva', 35], ['endothermicfire', 'Fogueira Gelada', 60], ['watermelon', 'Melancia', 12], ['strawhat', 'Chapeu', 15]],
}
// Sell catalog (same every season): [prefab, label, sellPrice].
const SELL = [['log', 'Madeira', 2], ['rocks', 'Pedra', 2], ['goldnugget', 'Ouro', 8], ['flint', 'Silex', 3]]

const SEASONS = ['autumn', 'winter', 'spring', 'summer']
const SEASON_LABEL = { autumn: 'Outono', winter: 'Inverno', spring: 'Primavera', summer: 'Verao' }

const nodes = [], edges = []
const N = (id, type, data, x, y) => { nodes.push({ id, type, position: { x, y }, data }); return id }
const E = (s, t, h) => edges.push(h ? { id: `e_${s}_${t}_${h}`, source: s, target: t, sourceHandle: h } : { id: `e_${s}_${t}`, source: s, target: t })

// trigger + route by callback prefix
N('trg', 'trigger', { event_type: 'ui_callback', alias: 'cb' }, 0, 0)
N('isopen', 'condition', { field: '{{cb.callback}}', operator: 'equals', value: 'open' }, 300, -200)
N('isbuy', 'condition', { field: '{{cb.callback}}', operator: 'starts_with', value: 'buy:' }, 300, 0)
N('issell', 'condition', { field: '{{cb.callback}}', operator: 'starts_with', value: 'sell:' }, 300, 300)
E('trg', 'isopen'); E('trg', 'isbuy'); E('trg', 'issell')

// shared sub-trees
const sellTab = () => ({ type: 'col', gap: 6, children: SELL.map(([p, l, price]) => ({
  type: 'row', gap: 8, children: [
    { type: 'icon', prefab: p, size: 32 },
    { type: 'text', text: `${l} (+${price})`, size: 16 },
    { type: 'button', text: 'Vender', callback: `sell:${p}`, width: 90, height: 34 },
  ],
})) })
const buyTab = (season) => ({ type: 'col', gap: 6, children: BUY[season].map(([p, l, price]) => ({
  type: 'row', gap: 8, children: [
    { type: 'icon', prefab: p, size: 32 },
    { type: 'text', text: `${l} (${price})`, size: 16 },
    { type: 'button', text: 'Comprar', callback: `buy:${p}`, width: 90, height: 34 },
  ],
})) })
const shopTree = (season) => ({
  type: 'panel', title: `Loja - ${SEASON_LABEL[season]}`, min_width: 320, gap: 8,
  children: [
    { type: 'row', gap: 8, children: [
      { type: 'icon', prefab: 'goldnugget', size: 28 },
      { type: 'text', id: 'saldo_txt', text: '{{coins.value}}', size: 24, color: [1, 0.85, 0.2, 1] },
    ] },
    { type: 'tabs', active: 0, tabs: [
      { label: 'Comprar', child: buyTab(season) },
      { label: 'Vender', child: sellTab() },
    ] },
  ],
})

// OPEN branch: read balance → normalize → switch by season → build shop
N('open_read', 'memory', { action: 'read', params: { flow: 'shop', key: 'coins:{{cb.userid}}' }, alias: 'bal' }, 600, -200)
N('open_norm', 'transform', { params: { value: '{{bal.value}}', operation: 'number' }, alias: 'coins' }, 860, -200)
N('open_sw', 'switch', { field: '{{cb.season}}', cases: SEASONS.map(s => ({ value: s })) }, 1120, -200)
E('isopen', 'open_read', 'true'); E('open_read', 'open_norm'); E('open_norm', 'open_sw')
SEASONS.forEach((s, i) => {
  N(`open_ui_${s}`, 'ui_builder', { params: { userid: '{{cb.userid}}', id: 'shop', anchor: 'center' }, tree: shopTree(s) }, 1400, -360 + i * 80)
  E('open_sw', `open_ui_${s}`, `case_${i}`)
})
N('open_ui_def', 'ui_builder', { params: { userid: '{{cb.userid}}', id: 'shop', anchor: 'center' }, tree: shopTree('autumn') }, 1400, 60)
E('open_sw', 'open_ui_def', 'default')

// BUY branch: prefab = after(callback, "buy:"); fixed price 10
N('buy_item', 'transform', { params: { value: '{{cb.callback}}', operation: 'after', operand: 'buy:' }, alias: 'item' }, 600, 0)
N('buy_read', 'memory', { action: 'read', params: { flow: 'shop', key: 'coins:{{cb.userid}}' }, alias: 'bal' }, 860, 0)
N('buy_norm', 'transform', { params: { value: '{{bal.value}}', operation: 'number' }, alias: 'coins' }, 1120, 0)
N('buy_can', 'condition', { field: '{{coins.value}}', operator: 'greater_than', value: '9' }, 1380, 0)
N('buy_charge', 'transform', { params: { value: '{{coins.value}}', operation: 'sub', operand: '10' }, alias: 'newbal' }, 1640, -60)
N('buy_write', 'memory', { action: 'write', params: { flow: 'shop', key: 'coins:{{cb.userid}}', value: '{{newbal.value}}' } }, 1900, -60)
N('buy_give', 'action', { action_type: 'give_item', params: { userid: '{{cb.userid}}', prefab: '{{item.value}}', count: '1' } }, 2160, -60)
N('buy_set', 'action', { action_type: 'ui_set', params: { userid: '{{cb.userid}}', id: 'shop', node: 'saldo_txt', text: '{{newbal.value}}' } }, 2420, -60)
N('buy_broke', 'action', { action_type: 'ui_notification', params: { userid: '{{cb.userid}}', text: 'Moedas insuficientes', duration: '2' } }, 1640, 120)
E('isbuy', 'buy_item', 'true'); E('buy_item', 'buy_read'); E('buy_read', 'buy_norm'); E('buy_norm', 'buy_can')
E('buy_can', 'buy_charge', 'true'); E('buy_can', 'buy_broke', 'false')
E('buy_charge', 'buy_write'); E('buy_write', 'buy_give'); E('buy_give', 'buy_set')

// SELL branch (ASYNC): only REQUEST the atomic removal — do NOT credit here.
// remove_item is async: the mod removes only if the player has the item and
// replies with an `item_removed { success }` event. Crediting must wait for that
// confirmation, otherwise selling an item you don't have would still pay you.
// The credit happens in a SECOND flow triggered by item_removed (see below).
N('sell_item', 'transform', { params: { value: '{{cb.callback}}', operation: 'after', operand: 'sell:' }, alias: 'item' }, 600, 300)
N('sell_remove', 'action', { action_type: 'remove_item', params: { userid: '{{cb.userid}}', prefab: '{{item.value}}', count: '1', token: 'sell' } }, 860, 300)
E('issell', 'sell_item', 'true'); E('sell_item', 'sell_remove')

const flow = { name: 'Loja completa — carteira + abas Comprar/Vender + itens por estacao (ui_callback)', nodes, edges }
fs.writeFileSync(path.join(__dirname, '../examples/flows/shop/shop-full.dstp.json'), JSON.stringify(flow, null, 2))
console.log('nodes:', nodes.length, 'edges:', edges.length)
