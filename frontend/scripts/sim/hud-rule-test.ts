#!/usr/bin/env bun
// Validates the ui_rule (HUD reativo) node end-to-end on a sim server:
// a flow whose only action is a ui_rule (HP bar preset) must, when triggered,
// push an install_rules command carrying a progress_bar rule bound to the
// live player health paths the mod's rules_engine resolves.

import { FlowRepository } from '../../app/server/db/repositories/FlowRepository'

const server = 'sim-hud'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_hud'

// HP-bar rule (mirrors what HudRuleNode.buildRule emits for the vital preset).
const RULE = [{
  id: 'health_bar',
  when: { event: 'healthdelta' },
  do: [{
    action: 'update_widget', id: 'health_bar_w', type: 'progress_bar',
    value: '{{player.health_current}}', max: '{{player.health_max}}',
    label: 'HP', color: [0.2, 0.9, 0.2, 1], anchor: 'bottom', x: 0, y: 80, width: 220, height: 16,
  }],
}]

new FlowRepository(server).save({
  id: 'hud-on-spawn', name: 'HUD ao entrar', enabled: true,
  nodes: [
    { id: 'trg', type: 'trigger', position: { x: 0, y: 0 }, data: { event_type: 'player_spawn', alias: 'p' } },
    { id: 'hud', type: 'ui_rule', position: { x: 240, y: 0 }, data: { action_type: 'rule_install', params: { userid: '{{p.userid}}', rules: JSON.stringify(RULE) } } },
  ],
  edges: [{ id: 'e1', source: 'trg', target: 'hud' }],
})

const sync = (events: any[]) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server_id: server, shard_id: `${server}:master`, shard_type: 'master',
    server: { name: server, phase: 'day' },
    players: [{ userid: USER, name: 'HudGuy', health: { current: 90, max: 150 } }],
    events,
  }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const drain = async () => { const got: any[] = []; for (let i = 0; i < 4; i++) { await sleep(250); const r = await sync([]); got.push(...(r.commands || [])) } return got }

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

await sync([]); await sleep(300)
await sync([{ type: 'player_spawn', data: { userid: USER, name: 'HudGuy' } }])
const got = await drain()

const inst = got.find(c => c.type === 'install_rules' || c.type === 'install_rules_all')
ck(!!inst, `install_rules emitido [tipos: ${[...new Set(got.map(c => c.type))].join(',') || 'nenhum'}]`)
ck(inst?.data?.userid === USER, `regra direcionada ao player [got ${inst?.data?.userid}]`)
const rule = inst?.data?.rules?.[0]
ck(rule?.id === 'health_bar' && rule?.when?.event === 'healthdelta', 'regra: id=health_bar, when=healthdelta')
const act = rule?.do?.[0]
ck(act?.action === 'update_widget' && act?.type === 'progress_bar', 'ação: update_widget progress_bar')
ck(act?.value === '{{player.health_current}}' && act?.max === '{{player.health_max}}', 'bind ao vivo: health_current/max')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
