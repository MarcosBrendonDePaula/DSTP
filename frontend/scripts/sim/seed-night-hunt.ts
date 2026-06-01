#!/usr/bin/env bun
// "Caçada Noturna Recompensada" — a showcase flow that exercises the whole
// system at once: trigger + get_player + world-context condition + UI widget +
// numeric-coerced actions (give_item count, heal amount).
//
// player_kill → get_player → if phase==night → notify + give gold + heal
//
// Usage: bun run scripts/sim/seed-night-hunt.ts [serverId]

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const serverId = process.argv[2] ?? 'dst-46AA39143167'
const repo = new FlowRepository(serverId)

repo.save({
  id: 'night-hunt',
  name: 'Caçada Noturna Recompensada',
  enabled: true,
  nodes: [
    {
      id: 'trg',
      type: 'trigger',
      position: { x: 0, y: 120 },
      data: { event_type: 'player_kill', alias: 'kill' },
    },
    {
      id: 'getp',
      type: 'get_player',
      position: { x: 280, y: 120 },
      data: { params: { userid: '{{kill.userid}}' }, alias: 'p' },
    },
    {
      id: 'cond',
      type: 'condition',
      position: { x: 560, y: 120 },
      data: { field: 'phase', operator: 'equals', value: 'night' },
    },
    {
      id: 'notify',
      type: 'action',
      position: { x: 840, y: 20 },
      data: {
        action_type: 'ui_notification',
        params: {
          userid: '{{kill.userid}}',
          text: 'Caca noturna! Recompensa por abater {{kill.victim}}',
          duration: '6',
        },
      },
    },
    {
      id: 'gold',
      type: 'action',
      position: { x: 840, y: 140 },
      data: { action_type: 'give_item', params: { userid: '{{kill.userid}}', prefab: 'goldnugget', count: '2' } },
    },
    {
      id: 'heal',
      type: 'action',
      position: { x: 840, y: 240 },
      data: { action_type: 'heal', params: { userid: '{{kill.userid}}', amount: '50' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'trg', target: 'getp' },
    { id: 'e2', source: 'getp', target: 'cond' },
    { id: 'e3', source: 'cond', target: 'notify', sourceHandle: 'true' },
    { id: 'e4', source: 'cond', target: 'gold', sourceHandle: 'true' },
    { id: 'e5', source: 'cond', target: 'heal', sourceHandle: 'true' },
  ],
})

console.log(`Flow "Caçada Noturna Recompensada" criado em "${serverId}".`)
console.log('Fluxo: player_kill → get_player → if night → [notificação + 2 ouro + heal 50]')
