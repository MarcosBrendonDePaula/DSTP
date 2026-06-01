#!/usr/bin/env bun
// "Morte invoca Boss" — quando um player morre, spawna um boss no local.
//   player_death → spawn_at_player(deerclops)
//
// Usage: bun run scripts/sim/seed-death-boss.ts [serverId] [bossPrefab]

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const serverId = process.argv[2] ?? 'dst-46AA39143167'
const boss = process.argv[3] ?? 'deerclops'
const repo = new FlowRepository(serverId)

repo.save({
  id: 'death-boss',
  name: 'Morte invoca Boss',
  enabled: true,
  nodes: [
    {
      id: 'trg',
      type: 'trigger',
      position: { x: 0, y: 100 },
      data: { event_type: 'player_death', alias: 'dead' },
    },
    {
      id: 'announce',
      type: 'action',
      position: { x: 300, y: 20 },
      data: { action_type: 'announce', params: { message: '{{dead.name}} morreu... algo desperta!' } },
    },
    {
      id: 'spawn',
      type: 'action',
      position: { x: 300, y: 160 },
      data: { action_type: 'spawn_at_player', params: { userid: '{{dead.userid}}', prefab: boss, count: '1', offset_x: '2', offset_z: '0' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'trg', target: 'announce' },
    { id: 'e2', source: 'trg', target: 'spawn' },
  ],
})

console.log(`Flow "Morte invoca Boss" criado em "${serverId}" (boss=${boss}).`)
console.log('Fluxo: player_death → announce + spawn_at_player')
