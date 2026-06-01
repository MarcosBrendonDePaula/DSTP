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

// Wait/Merge flow: two different triggers converge on a Wait node (mode 'all').
// The Wait only releases after BOTH a player_death AND a chat_message have
// arrived — exercising the per-worker WorkflowInstanceStore across multiple
// separate event messages to the core.
repo.save({
  id: 'sim-wait-merge',
  name: 'sim: wait/merge (death + chat)',
  enabled: true,
  nodes: [
    {
      id: 'wtrgA',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { event_type: 'player_death', alias: 'death' },
    },
    {
      id: 'wtrgB',
      type: 'trigger',
      position: { x: 0, y: 150 },
      data: { event_type: 'chat_message', alias: 'chat' },
    },
    {
      id: 'wnode',
      type: 'wait',
      position: { x: 300, y: 75 },
      data: { mode: 'all', correlation: 'broadcast', timeoutMs: '300000', timeoutAction: 'discard' },
    },
    {
      id: 'wact',
      type: 'action',
      position: { x: 600, y: 75 },
      // generic action → command type "announce" carrying both branches' data
      data: { action_type: 'announce', params: { message: 'merged: {{death.userid}} + {{chat.userid}}' } },
    },
  ],
  edges: [
    { id: 'we1', source: 'wtrgA', target: 'wnode' },
    { id: 'we2', source: 'wtrgB', target: 'wnode' },
    { id: 'we3', source: 'wnode', target: 'wact' },
  ],
})

// "Heal damage during the day": player_attacked → if phase==day → heal back the
// damage taken (effective daytime invulnerability). Exercises the world context
// (phase) now injected into every event.
repo.save({
  id: 'sim-day-heal',
  name: 'sim: heal damage during day',
  enabled: true,
  nodes: [
    { id: 'dtrg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_attacked', alias: 'hit' } },
    { id: 'dcond', type: 'condition', position: { x: 300, y: 0 }, data: { field: 'phase', operator: 'equals', value: 'day' } },
    { id: 'dheal', type: 'action', position: { x: 600, y: 0 }, data: { action_type: 'heal', params: { userid: '{{hit.userid}}', amount: '{{hit.damage_resolved}}' } } },
  ],
  edges: [
    { id: 'de1', source: 'dtrg', target: 'dcond' },
    { id: 'de2', source: 'dcond', target: 'dheal', sourceHandle: 'true' },
  ],
})

console.log(`Seeded test flows into server "${serverId}":`)
for (const f of repo.findAll()) {
  console.log(`  ${f.enabled ? '●' : '○'} ${f.id}  "${f.name}"`)
}
