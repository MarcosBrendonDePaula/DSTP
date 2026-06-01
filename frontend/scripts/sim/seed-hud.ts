#!/usr/bin/env bun
// HUD pequeno no canto inferior direito mostrando dados do player ao vivo:
// posição (x,z), dinheiro e dia/fase. Server-push via evento `tick` (~1s).
//   hud-open: player_spawn → UI Builder (painel ancorado bottomright)
//   hud-tick: tick → ui_set nos textos (pos, dinheiro lido da memory, mundo)
//
// Usage: bun run scripts/sim/seed-hud.ts [serverId]

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

export function seedHud(serverId: string) {
  const repo = new FlowRepository(serverId)

  // Painel compacto, ancorado no canto inferior direito. Textos endereçáveis.
  const tree = {
    type: 'panel', title: 'Você', closeable: false, anchor: 'bottomright', gap: 4, min_width: 180,
    children: [
      { type: 'text', id: 'pos_txt', text: 'Pos: -, -', size: 15, color: [0.8, 0.9, 1, 1] },
      { type: 'text', id: 'coins_txt', text: 'Moedas: 0', size: 15, color: [1, 0.9, 0.4, 1] },
      { type: 'text', id: 'world_txt', text: 'Dia -', size: 15, color: [0.7, 1, 0.7, 1] },
    ],
  }

  repo.save({
    id: 'hud-open', name: 'HUD: abrir', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_spawn', alias: 'p' } },
      { id: 'ui', type: 'ui_builder', position: { x: 220, y: 0 }, data: { tree, params: { id: 'hud', userid: '{{p.userid}}', anchor: 'bottomright' } } },
    ],
    edges: [{ id: 'e1', source: 'trg', target: 'ui' }],
  })

  // tick → atualiza os três textos. Dinheiro vem da memory do shop-buy.
  repo.save({
    id: 'hud-tick', name: 'HUD: atualizar (tick)', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'tick', alias: 't' } },
      { id: 'bal', type: 'memory', position: { x: 200, y: 0 }, data: { action: 'read', alias: 'bal', params: { key: 'coins:{{t.userid}}', flow: 'shop-buy' } } },
      { id: 'pos', type: 'action', position: { x: 400, y: -80 }, data: { action_type: 'ui_set', params: { userid: '{{t.userid}}', id: 'hud', node: 'pos_txt', text: 'Pos: {{t.x}}, {{t.z}}' } } },
      { id: 'coin', type: 'action', position: { x: 400, y: 0 }, data: { action_type: 'ui_set', params: { userid: '{{t.userid}}', id: 'hud', node: 'coins_txt', text: 'Moedas: {{bal.value}}' } } },
      { id: 'wld', type: 'action', position: { x: 400, y: 80 }, data: { action_type: 'ui_set', params: { userid: '{{t.userid}}', id: 'hud', node: 'world_txt', text: 'Dia {{t.day}} - {{t.phase}}' } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'bal' },
      { id: 'e2', source: 'bal', target: 'pos' },
      { id: 'e3', source: 'bal', target: 'coin' },
      { id: 'e4', source: 'bal', target: 'wld' },
    ],
  })
}

if (import.meta.main) {
  const serverId = process.argv[2] ?? 'sim-hud2'
  seedHud(serverId)
  console.log(`HUD criado em "${serverId}": hud-open + hud-tick`)
  process.exit(0)
}
