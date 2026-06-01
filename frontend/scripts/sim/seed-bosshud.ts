import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
export function seedBossHud(serverId: string) {
  const repo = new FlowRepository(serverId)
  repo.save({
    id: 'boss-hud', name: 'HUD sobre boss (#boss)', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'chat_message', alias: 'tm' } },
      { id: 'cond', type: 'condition', position: { x: 200, y: 0 }, data: { field: '{{tm.message}}', operator: 'contains', value: 'boss' } },
      { id: 'ui', type: 'action', position: { x: 400, y: 0 }, data: { action_type: 'ui_track', params: { userid: '{{tm.userid}}', id: 'boss_hp', prefab: '', label: 'Alvo', max_dist: '40', offset_y: '70', width: '120', color: '[0.9,0.2,0.2,1]' } } },
    ],
    edges: [{ id: 'e1', source: 'trg', target: 'cond' }, { id: 'e2', source: 'cond', target: 'ui', sourceHandle: 'true' }],
  })
}
if (import.meta.main) { seedBossHud(process.argv[2] ?? 'dst-46AA39143167'); console.log('boss-hud criado'); process.exit(0) }
