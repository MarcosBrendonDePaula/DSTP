import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'
export function seedHitBar(serverId: string) {
  const repo = new FlowRepository(serverId)
  // Quando o player ACERTA um mob (player_hit_other), cria/atualiza uma barra de
  // vida sobre AQUELE alvo (por GUID). Ignora se o alvo for outro player.
  repo.save({
    id: 'hit-hpbar', name: 'Barra de vida no mob atingido', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_hit_other', alias: 'e' } },
      { id: 'cond', type: 'condition', position: { x: 220, y: 0 }, data: { field: '{{e.target_is_player}}', operator: 'not_equals', value: 'true' } },
      { id: 'bar', type: 'action', position: { x: 440, y: 0 }, data: { action_type: 'ui_track', params: {
        userid: '{{e.userid}}',
        id: 'hit_hp',                 // mesmo id → reusa/atualiza a barra a cada hit
        guid: '{{e.target_guid}}',    // segue o alvo EXATO que foi batido
        label: '{{e.target}}',
        offset_y: '70', width: '90', color: '[0.9,0.2,0.2,1]',
      } } },
    ],
    edges: [
      { id: 'e1', source: 'trg', target: 'cond' },
      { id: 'e2', source: 'cond', target: 'bar', sourceHandle: 'true' },
    ],
  })
  repo.toggle('hit-hpbar', true)
}
if (import.meta.main) { seedHitBar(process.argv[2] ?? 'dst-46AA39143167'); console.log('hit-hpbar criado'); process.exit(0) }
