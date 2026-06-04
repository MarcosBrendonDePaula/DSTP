import type { NodeHandler } from '@server/live/nodes/types'

// Land-claim management. Maps the chosen operation to the matching mod command.
// The mod (v0.6.0+) owns the claim store and the blocking overrides; this node
// only queues the management command. POLICY (who may claim, limits, cost) is the
// flow's job — gate `add`/`remove`/`trust` behind an admin or payment check.
//
// Positions: when x/z are omitted the mod uses the player's current position
// (resolved from userid), so a simple "!claim" flow only needs the userid.
export const handler: NodeHandler = async (rc) => {
  const op = String(rc.param('operation') || 'add')
  const userid = rc.resolve(rc.param('userid'))
  const owner = rc.resolve(rc.param('owner')) || userid

  // Optional explicit coords; if absent the mod falls back to the player's pos.
  const x = rc.param('x') !== undefined && rc.param('x') !== '' ? Number(rc.resolve(rc.param('x'))) : undefined
  const z = rc.param('z') !== undefined && rc.param('z') !== '' ? Number(rc.resolve(rc.param('z'))) : undefined
  const radius = Number(rc.resolve(rc.param('radius'))) || 20
  const token = rc.resolve(rc.param('token')) || ''

  let queued = true
  switch (op) {
    case 'add':
      rc.pushCommand('claim_add', { owner, userid, x, z, radius })
      break
    case 'remove':
      // remove by point (x/z) or, with at_player, the claim under the player.
      rc.pushCommand('claim_remove', { owner, userid, x, z, at_player: x === undefined })
      break
    case 'trust':
      rc.pushCommand('claim_trust', {
        owner, userid, x, z,
        friend: rc.resolve(rc.param('friend')),
        on: rc.param('on') !== 'false',
      })
      break
    case 'list':
      rc.pushCommand('claim_list', { token })
      break
    case 'check':
      rc.pushCommand('claim_check', { userid, x, z, token })
      break
    default:
      queued = false
  }

  rc.setContext({ queued, operation: op })
  return 'continue'
}
