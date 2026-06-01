#!/usr/bin/env bun
// Seeds the "heal damage during the day" flow into a real server.
// Usage: bun run scripts/sim/seed-day-heal.ts <serverId>

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const serverId = process.argv[2] ?? 'dst-46AA39143167'
const repo = new FlowRepository(serverId)

repo.save({
  id: 'day-heal',
  name: 'Curar dano durante o dia',
  enabled: true,
  nodes: [
    {
      id: 'trg',
      type: 'trigger',
      position: { x: 0, y: 100 },
      data: { event_type: 'player_attacked', alias: 'hit' },
    },
    {
      id: 'cond',
      type: 'condition',
      position: { x: 320, y: 100 },
      data: { field: 'phase', operator: 'equals', value: 'day' },
    },
    {
      id: 'heal',
      type: 'action',
      position: { x: 640, y: 60 },
      data: { action_type: 'heal', params: { userid: '{{hit.userid}}', amount: '{{hit.damage_resolved}}' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'trg', target: 'cond' },
    { id: 'e2', source: 'cond', target: 'heal', sourceHandle: 'true' },
  ],
})

console.log(`Flow "Curar dano durante o dia" criado em "${serverId}":`)
for (const f of repo.findAll()) {
  console.log(`  ${f.enabled ? '●' : '○'} ${f.id}  "${f.name}"`)
}
