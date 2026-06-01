// Scenario runner — drives a SimHost through a scripted sequence of steps and
// optionally asserts on the commands the backend returns. Used for automated
// regression tests of the execution engine (e.g. "this flow, on this event,
// must emit this command" — and stays true after we move execution to workers).
//
// Scenario JSON shape:
// {
//   "server": "sim-test",
//   "url": "http://127.0.0.1:3000",
//   "players": [{ "userid": "KU_a", "name": "Alice", "admin": true }],
//   "steps": [
//     { "emit": "player_death", "data": { "userid": "KU_a" } },
//     { "wait": 500 },
//     { "expectCommand": { "type": "respawn" } }
//   ]
// }

import { SimHost } from './SimHost'
import type { SyncResponse } from './protocol'

interface Step {
  emit?: string
  data?: Record<string, any>
  wait?: number                         // ms to wait (lets fire-and-forget flows settle)
  poll?: boolean                        // force a poll (drains queued commands)
  join?: { userid: string; name: string; prefab?: string; admin?: boolean }
  leave?: string
  world?: { day?: number; phase?: string; season?: string }
  expectCommand?: { type: string; match?: Record<string, any> }
  expectNoCommand?: { type: string }
  clearReceived?: boolean                // forget commands seen so far (for fresh expectNoCommand windows)
  note?: string
}

interface Scenario {
  server: string
  url?: string
  interval?: number
  players?: Array<{ userid: string; name: string; prefab?: string; admin?: boolean }>
  steps: Step[]
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function commandMatches(cmd: any, type: string, match?: Record<string, any>): boolean {
  if (cmd.type !== type) return false
  if (!match) return true
  const data = cmd.data ?? {}
  return Object.entries(match).every(([k, v]) => JSON.stringify(data[k]) === JSON.stringify(v))
}

export async function runScenario(host: SimHost, file: string): Promise<boolean> {
  const scenario: Scenario = JSON.parse(await Bun.file(file).text())
  return runScenarioObject(host, scenario)
}

export async function runScenarioObject(host: SimHost, scenario: Scenario): Promise<boolean> {
  // Collect every command the backend returns across the whole run.
  const received: Array<{ type: string; data?: any }> = []
  ;(host as any).onCommands = (commands: SyncResponse['commands']) => {
    for (const c of commands) received.push(c)
  }

  for (const p of scenario.players ?? []) host.addPlayer(p)

  let passed = 0
  let failed = 0
  let stepNo = 0

  for (const step of scenario.steps) {
    stepNo++
    if (step.note) console.log(`\x1b[90m# ${step.note}\x1b[0m`)

    if (step.clearReceived) { received.length = 0 }
    if (step.join) { host.addPlayer(step.join); host.emit('player_spawn', { userid: step.join.userid }) }
    if (step.leave) { host.emit('player_left', { userid: step.leave }); host.removePlayer(step.leave) }
    if (step.world) host.setWorld(step.world)

    if (step.emit) {
      host.emit(step.emit, step.data ?? {})
      // emit always followed by a poll to deliver it
      await host.poll()
    }

    if (step.poll) await host.poll()
    if (step.wait) await sleep(step.wait)

    if (step.expectCommand) {
      // Drain one more poll in case the command was queued by a fire-and-forget flow.
      await host.poll()
      const { type, match } = step.expectCommand
      const found = received.find(c => commandMatches(c, type, match))
      if (found) {
        console.log(`\x1b[32m✓\x1b[0m step ${stepNo}: got command "${type}"`)
        passed++
      } else {
        console.log(`\x1b[31m✗\x1b[0m step ${stepNo}: expected command "${type}"${match ? ' ' + JSON.stringify(match) : ''}, got: [${received.map(c => c.type).join(', ') || 'none'}]`)
        failed++
      }
    }

    if (step.expectNoCommand) {
      await host.poll()
      const found = received.find(c => c.type === step.expectNoCommand!.type)
      if (found) {
        console.log(`\x1b[31m✗\x1b[0m step ${stepNo}: did NOT expect command "${step.expectNoCommand.type}" but got it`)
        failed++
      } else {
        console.log(`\x1b[32m✓\x1b[0m step ${stepNo}: no "${step.expectNoCommand.type}" command (as expected)`)
        passed++
      }
    }
  }

  host.stop()
  console.log(`\nScenario "${scenario.server}": \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`)
  return failed === 0
}
