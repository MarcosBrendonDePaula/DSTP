#!/usr/bin/env bun
// "Morte invoca Boss (aleatório)" — quando um player morre, um Script node
// sorteia um boss e ele spawna no local da morte, com anúncio.
//   player_death → script(sorteia boss) → announce + spawn_at_player({{pick.boss}})
//
// Usage: bun run scripts/sim/seed-death-boss.ts [serverId]

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const serverId = process.argv[2] ?? 'dst-46AA39143167'
const repo = new FlowRepository(serverId)

const PICK_CODE = `async function run(context) {
  // Sorteia um boss da lista. Math.random() funciona no Script node.
  const bosses = [
    { prefab: "deerclops",  nome: "Deerclops" },
    { prefab: "bearger",    nome: "Bearger" },
    { prefab: "dragonfly",  nome: "Dragonfly" },
    { prefab: "moose",      nome: "Moose/Goose" },
    { prefab: "antlion",    nome: "Antlion" },
  ]
  const pick = bosses[Math.floor(Math.random() * bosses.length)]
  return { boss: pick.prefab, nome: pick.nome }
}`

repo.save({
  id: 'death-boss',
  name: 'Morte invoca Boss (aleatorio)',
  enabled: true,
  nodes: [
    {
      id: 'trg',
      type: 'trigger',
      position: { x: 0, y: 120 },
      data: { event_type: 'player_death', alias: 'dead' },
    },
    {
      id: 'pick',
      type: 'action',
      position: { x: 280, y: 120 },
      data: { action_type: 'script', alias: 'pick', params: { code: PICK_CODE } },
    },
    {
      id: 'announce',
      type: 'action',
      position: { x: 580, y: 40 },
      data: { action_type: 'announce', params: { message: '{{dead.name}} morreu... {{pick.nome}} desperta!' } },
    },
    {
      id: 'spawn',
      type: 'action',
      position: { x: 580, y: 180 },
      data: { action_type: 'spawn_at_player', params: { userid: '{{dead.userid}}', prefab: '{{pick.boss}}', count: '1', offset_x: '3', offset_z: '0' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'trg', target: 'pick' },
    { id: 'e2', source: 'pick', target: 'announce' },
    { id: 'e3', source: 'pick', target: 'spawn' },
  ],
})

console.log(`Flow "Morte invoca Boss (aleatorio)" criado em "${serverId}".`)
console.log('player_death → script(sorteia boss) → announce + spawn_at_player')
