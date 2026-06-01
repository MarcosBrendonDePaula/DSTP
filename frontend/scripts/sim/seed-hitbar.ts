import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

// Barra de vida sobre o mob que você está atacando.
// onhitother/onattackother são SERVER-only e o mod roda no cliente, então não
// dá pra reagir ao "bati". Em vez disso, a barra usa modo combat_target:
// o cliente lê player.replica.combat:GetTarget() e segue o alvo de combate
// atual, atualizando vida/nome e trocando de alvo sozinho.
//
// O flow só precisa CRIAR a barra uma vez (ao entrar); o tracking é client-side.
export function seedHitBar(serverId: string) {
  const repo = new FlowRepository(serverId)
  repo.save({
    id: 'hit-hpbar', name: 'Barra de vida no alvo de combate', enabled: true,
    nodes: [
      { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_spawn', alias: 'p' } },
      { id: 'bar', type: 'action', position: { x: 240, y: 0 }, data: { action_type: 'ui_track', params: {
        userid: '{{p.userid}}',
        id: 'hit_hp',
        mode: 'combat_target',   // segue quem o player está atacando (client-side)
        label: 'Alvo',
        offset_y: '70', width: '90', color: '[0.9,0.2,0.2,1]',
      } } },
    ],
    edges: [{ id: 'e1', source: 'trg', target: 'bar' }],
  })
  repo.toggle('hit-hpbar', true)
}
if (import.meta.main) { seedHitBar(process.argv[2] ?? 'dst-46AA39143167'); console.log('hit-hpbar (combat_target) criado'); process.exit(0) }
