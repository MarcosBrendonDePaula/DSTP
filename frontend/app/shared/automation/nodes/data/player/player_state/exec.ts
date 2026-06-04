import type { NodeHandler, NodeRunContext } from '@server/live/nodes/types'

// Map each attribute to the mod command + the param shape to send. The mod
// commands were added in client.lua (v0.4.0); position reuses the existing
// `teleport`. `value`/`mode` come from the node params; `userid` always.
type Builder = (rc: NodeRunContext, userid: string) => { command: string; data: any } | null

// Resolve a param and coerce to a finite number (templates resolve to strings).
function num(rc: NodeRunContext, key: string): number | undefined {
  const n = Number(rc.resolve(rc.param(key)))
  return Number.isFinite(n) ? n : undefined
}

const ATTRIBUTES: Record<string, Builder> = {
  temperature: (rc, userid) => ({ command: 'set_temperature', data: { userid, value: num(rc, 'value') } }),
  moisture:    (rc, userid) => ({ command: 'set_moisture', data: { userid, percent: num(rc, 'value') } }),
  max_health:  (rc, userid) => ({ command: 'set_max_health', data: { userid, value: num(rc, 'value') } }),
  speed:       (rc, userid) => ({ command: 'set_player_speed', data: { userid, multiplier: num(rc, 'value') } }),

  // on/off attributes — `mode` carries the choice.
  fire: (rc, userid) => ({ command: rc.param('mode') === 'off' ? 'extinguish' : 'ignite', data: { userid } }),
  freeze: (rc, userid) => rc.param('mode') === 'off'
    ? { command: 'unfreeze', data: { userid } }
    : { command: 'freeze', data: { userid, duration: num(rc, 'value') } },

  // Vitals — percent (0..1) or exact value, per `mode`.
  health: (rc, userid) => vital('set_health', rc, userid),
  hunger: (rc, userid) => vital('set_hunger', rc, userid),
  sanity: (rc, userid) => vital('set_sanity', rc, userid),

  // Position reuses the existing teleport command.
  position: (rc, userid) => ({ command: 'teleport', data: { userid, x: num(rc, 'x'), z: num(rc, 'z') } }),
}

function vital(command: string, rc: NodeRunContext, userid: string) {
  const v = num(rc, 'value')
  return rc.param('mode') === 'value'
    ? { command, data: { userid, value: v } }
    : { command, data: { userid, percent: v } }
}

export const handler: NodeHandler = async (rc) => {
  const userid = rc.resolve(rc.param('userid'))
  const attribute = String(rc.param('attribute') || 'temperature')
  const build = ATTRIBUTES[attribute]

  if (userid && build) {
    const cmd = build(rc, userid)
    if (cmd) rc.pushCommand(cmd.command, cmd.data)
  }
  rc.setContext({ applied: !!(userid && build), attribute })
  return 'continue'
}
