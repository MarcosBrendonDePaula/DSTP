#!/usr/bin/env bun
// Validates the live HUD: player_spawn opens a bottomright panel (UI Builder),
// and the backend's synthetic `tick` (emitted on sync with a player present)
// drives ui_set updates for position, coins and world.

import { seedHud } from './seed-hud.ts'
import { FlowMemoryRepository } from '../../app/server/db/repositories/FlowMemoryRepository'

const server = 'sim-hud2'
const URL = 'http://127.0.0.1:3000/api/dst/sync'
const USER = 'KU_hud2'

seedHud(server)
new FlowMemoryRepository(server).set('shop-buy', `coins:${USER}`, 55)

const sync = (events: any[], extra: any = {}) => fetch(URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server_id: server, shard_id: `${server}:master`, shard_type: 'master',
    server: { name: server, phase: 'dusk', day: 7, season: 'autumn' },
    players: [{ userid: USER, name: 'H', position: { x: 12, y: 0, z: -34 }, health: { current: 88, max: 150 }, hunger: { current: 70 }, sanity: { current: 120 }, ...extra }],
    events,
  }),
}).then(r => r.json() as Promise<any>)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const ck = (c: boolean, m: string) => { console.log(`${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`); c ? pass++ : fail++ }

// register the server + first sync (this also emits the first tick)
await sync([]); await sleep(300)

// player_spawn → HUD opens
await sync([{ type: 'player_spawn', data: { userid: USER, name: 'H' } }])
let cmds: any[] = []
for (let i = 0; i < 3; i++) { await sleep(250); const r = await sync([]); cmds.push(...(r.commands || [])) }
const tree = cmds.find(c => c.type === 'ui_command' && c.data?.cmd?.type === 'tree')?.data?.cmd
ck(!!tree && tree.tree?.title === 'Você', `HUD aberto (panel) [${tree?.tree?.title}]`)
ck(tree?.anchor === 'bottomleft' || tree?.tree?.anchor === 'bottomleft', `ancorado bottomleft [${tree?.anchor || tree?.tree?.anchor}]`)

// tick updates: wait > 1s (throttle) and drain set commands
await sleep(1100)
cmds = []
for (let i = 0; i < 3; i++) { await sleep(400); const r = await sync([]); cmds.push(...(r.commands || [])) }
const sets = cmds.filter(c => c.type === 'ui_command' && c.data?.cmd?.action === 'set')
const byNode = (n: string) => sets.find(c => c.data?.cmd?.node === n)?.data?.cmd?.props?.text
ck(sets.length >= 5, `ui_set emitidos pelo tick [${sets.length}]`)
ck(byNode('pos_txt') === 'Pos: 12, -34', `posição (via get_player) [${byNode('pos_txt')}]`)
ck(byNode('hp_txt') === 'Vida: 88/150', `vida (via get_player) [${byNode('hp_txt')}]`)
ck(byNode('hunger_txt') === 'Fome: 70', `fome (via get_player) [${byNode('hunger_txt')}]`)
ck(byNode('san_txt') === 'Sanidade: 120', `sanidade (via get_player) [${byNode('san_txt')}]`)
ck(byNode('coins_txt') === 'Moedas: 55', `dinheiro atualizado [${byNode('coins_txt')}]`)
ck(/Dia 7/.test(byNode('world_txt') || ''), `mundo atualizado [${byNode('world_txt')}]`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
