#!/usr/bin/env bun
// DSTP Game Simulator — interactive synthetic DST host.
//
// Recreates the mod's polling loop: keeps polling POST /api/dst/sync and lets
// you inject fake game events by typing commands. Commands the backend returns
// (from your flows) are printed as they arrive.
//
// Usage:
//   bun run scripts/sim/sim.ts [--server sim-1] [--url http://127.0.0.1:3000]
//                              [--interval 1000] [--scenario file.json]
//
// Interactive commands (type `help`):
//   join <userid> <name>        add a player
//   leave <userid>              remove a player
//   players                     list players
//   death <userid> [cause]      emit player_death
//   chat <userid> <msg...>      emit chat_message
//   hp <userid> <delta>         emit health_delta and update hp
//   emit <type> [json]          emit any raw event
//   world day=5 phase=night     set world state
//   poll                        force an immediate poll
//   stats                       show poll/command counters
//   quit

import { SimHost } from './SimHost'
import { runScenario } from './scenario'

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
      out[key] = val
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

const host = new SimHost({
  baseUrl: args.url ?? 'http://127.0.0.1:3000',
  serverId: args.server ?? 'sim-1',
  pollIntervalMs: args.interval ? Number(args.interval) : 1000,
  verbose: true,
  onCommands: (commands) => {
    for (const c of commands) {
      console.log(`\x1b[36m  ⟵ COMMAND\x1b[0m ${c.type} ${JSON.stringify(c.data ?? {})}`)
    }
  },
  onError: (err) => {
    console.error(`\x1b[31m  ⚠ poll failed:\x1b[0m`, (err as any)?.message ?? err)
  },
})

// Scenario mode: run a scripted sequence and exit.
if (args.scenario) {
  console.log(`Running scenario: ${args.scenario}`)
  const ok = await runScenario(host, args.scenario)
  process.exit(ok ? 0 : 1)
}

// Interactive mode.
console.log(`\x1b[1mDSTP Simulator\x1b[0m — server=${args.server ?? 'sim-1'} url=${host['baseUrl']}`)
console.log(`Polling every ${args.interval ?? 1000}ms. Type \x1b[1mhelp\x1b[0m for commands, \x1b[1mquit\x1b[0m to exit.\n`)

// Seed a default player so flows have someone to act on.
host.addPlayer({ userid: 'KU_sim0001', name: 'SimPlayer', admin: true })
host.start()

const HELP = `commands:
  join <userid> <name> [prefab]   add a player
  leave <userid>                  remove a player
  players                         list players
  death <userid> [cause]          emit player_death
  chat <userid> <msg...>          emit chat_message  (use #cmd to trigger chat flows)
  hp <userid> <delta>             emit health_delta + update hp
  hunger <userid> <delta>         emit hunger_delta + update hunger
  craft <userid> <prefab>         emit player_craft
  emit <type> [json]              emit any event with optional JSON data
  world key=val ...               set world (day/phase/season)
  poll                            force an immediate poll
  stats                           show counters
  help / quit`

function handle(line: string) {
  const [cmd, ...rest] = line.trim().split(/\s+/)
  if (!cmd) return

  switch (cmd) {
    case 'join': {
      const [userid, name, prefab] = rest
      if (!userid || !name) return console.log('usage: join <userid> <name> [prefab]')
      host.addPlayer({ userid, name, prefab })
      host.emit('player_spawn', { userid, name })
      console.log(`+ ${name} (${userid})`)
      break
    }
    case 'leave': {
      const [userid] = rest
      if (!userid) return console.log('usage: leave <userid>')
      host.emit('player_left', { userid })
      host.removePlayer(userid)
      console.log(`- ${userid}`)
      break
    }
    case 'players': {
      const ps = host['players'] as Map<string, any>
      if (ps.size === 0) console.log('(no players)')
      for (const p of ps.values()) {
        console.log(`  ${p.userid}  ${p.name}  hp=${p.health?.current}/${p.health?.max}`)
      }
      break
    }
    case 'death': {
      const [userid, ...cause] = rest
      host.emit('player_death', { userid, cause: cause.join(' ') || 'unknown' })
      console.log(`☠ death ${userid}`)
      break
    }
    case 'chat': {
      const [userid, ...msg] = rest
      host.emit('chat_message', { userid, message: msg.join(' ') })
      console.log(`💬 ${userid}: ${msg.join(' ')}`)
      break
    }
    case 'hp':
    case 'hunger': {
      const [userid, deltaStr] = rest
      const delta = Number(deltaStr)
      const field = cmd === 'hp' ? 'health' : 'hunger'
      const p = host.getPlayer(userid)
      if (p && (p as any)[field]) {
        ;(p as any)[field].current = Math.max(0, (p as any)[field].current + delta)
      }
      host.emit(cmd === 'hp' ? 'health_delta' : 'hunger_delta', { userid, delta, current: (p as any)?.[field]?.current })
      console.log(`${field} ${userid} ${delta >= 0 ? '+' : ''}${delta}`)
      break
    }
    case 'craft': {
      const [userid, prefab] = rest
      host.emit('player_craft', { userid, item: prefab, prefab })
      console.log(`🔨 ${userid} crafted ${prefab}`)
      break
    }
    case 'emit': {
      const [type, ...jsonParts] = rest
      let data = {}
      if (jsonParts.length) {
        try { data = JSON.parse(jsonParts.join(' ')) } catch { return console.log('invalid JSON') }
      }
      host.emit(type, data)
      console.log(`→ emit ${type}`)
      break
    }
    case 'world': {
      const patch: any = {}
      for (const kv of rest) {
        const [k, v] = kv.split('=')
        if (k === 'day') patch.day = Number(v)
        else patch[k] = v
      }
      host.setWorld(patch)
      console.log(`world ${JSON.stringify(patch)}`)
      break
    }
    case 'poll': {
      void host.poll()
      break
    }
    case 'stats': {
      console.log(`polls=${host.pollCount} commands=${host.commandCount}`)
      break
    }
    case 'help': {
      console.log(HELP)
      break
    }
    case 'quit':
    case 'exit': {
      host.stop()
      process.exit(0)
    }
    default:
      console.log(`unknown: ${cmd} (type help)`)
  }
}

for await (const line of console) {
  handle(line)
}
