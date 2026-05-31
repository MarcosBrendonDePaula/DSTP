#!/usr/bin/env bun
// Seeds a couple of test flows into a sim server's DB so the simulator has
// something to trigger. Run once before a scenario:
//   bun run scripts/sim/seed-test-flow.ts [server-id]
//
// Flows created:
//   "sim: death → respawn"  — player_death trigger → respawn action
//   "sim: slow script"      — player_death trigger → script with a busy loop
//                             (used to test the worker timeout isolation)

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const serverId = process.argv[2] ?? 'sim-1'
const repo = new FlowRepository(serverId)

repo.save({
  id: 'sim-death-respawn',
  name: 'sim: death → respawn',
  enabled: true,
  nodes: [
    {
      id: 'trg1',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { event_type: 'player_death', alias: 'death' },
    },
    {
      id: 'act1',
      type: 'action',
      position: { x: 300, y: 0 },
      data: { action_type: 'respawn', params: { userid: '{{death.userid}}' } },
    },
  ],
  edges: [{ id: 'e1', source: 'trg1', target: 'act1' }],
})

repo.save({
  id: 'sim-slow-script',
  name: 'sim: slow script',
  enabled: false, // off by default; enable to test worker timeout
  nodes: [
    {
      id: 'trg2',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { event_type: 'chat_message', alias: 'chat' },
    },
    {
      id: 'scr1',
      type: 'action',
      position: { x: 300, y: 0 },
      data: {
        action_type: 'script',
        params: {
          code: 'function run(context){ const t=Date.now(); while(Date.now()-t<60000){} return {done:true}; }',
        },
      },
    },
  ],
  edges: [{ id: 'e2', source: 'trg2', target: 'scr1' }],
})

console.log(`Seeded test flows into server "${serverId}":`)
for (const f of repo.findAll()) {
  console.log(`  ${f.enabled ? '●' : '○'} ${f.id}  "${f.name}"`)
}
