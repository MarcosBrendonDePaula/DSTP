import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

// Comando de chat: "#spawn <prefab> [count]" → spawna a criatura/objeto perto do player.
// Ex: "#spawn hound", "#spawn spider 3", "#spawn deerclops"
const PARSE = `async function run(context) {
  const msg = String(context.trigger.message || "").trim();
  // aceita #spawn, /spawn, !spawn, .spawn
  const m = msg.match(/^[#\/!.]?spawn\s+([a-z_0-9]+)\s*(\d+)?/i);
  if (!m) return { ok: false };
  const prefab = m[1].toLowerCase();
  let count = Math.max(1, Math.min(parseInt(m[2] || "1", 10) || 1, 10)); // teto 10
  return { ok: true, prefab, count };
}`

export function seedSpawnCmd(serverId: string) {
  const repo = new FlowRepository(serverId)
  repo.save({
    id: 'cmd-spawn', name: 'Comando #spawn <bixo>', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
      { id: 'cond', type: 'condition', position: { x: 200, y: 0 }, data: { field: '{{tm.message}}', operator: 'contains', value: 'spawn' } },
      { id: 'parse', type: 'action', position: { x: 400, y: 0 }, data: { action_type: 'script', alias: 's', params: { code: PARSE } } },
      { id: 'ok', type: 'condition', position: { x: 600, y: 0 }, data: { field: '{{s.ok}}', operator: 'equals', value: 'true' } },
      { id: 'spawn', type: 'action', position: { x: 800, y: -40 }, data: { action_type: 'spawn_at_player', params: {
        userid: '{{tm.userid}}', prefab: '{{s.prefab}}', count: '{{s.count}}', offset_x: '2', offset_z: '0',
      } } },
      { id: 'msg', type: 'action', position: { x: 800, y: 60 }, data: { action_type: 'private_message', params: {
        userid: '{{tm.userid}}', message: 'Spawnado: {{s.count}}x {{s.prefab}}',
      } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'cond' },
      { id: 'e2', source: 'cond', target: 'parse', sourceHandle: 'true' },
      { id: 'e3', source: 'parse', target: 'ok' },
      { id: 'e4', source: 'ok', target: 'spawn', sourceHandle: 'true' },
      { id: 'e5', source: 'ok', target: 'msg', sourceHandle: 'true' },
    ],
  })
  repo.toggle('cmd-spawn', true)
}
if (import.meta.main) { seedSpawnCmd(process.argv[2] ?? 'dst-46AA39143167'); console.log('cmd-spawn criado'); process.exit(0) }
