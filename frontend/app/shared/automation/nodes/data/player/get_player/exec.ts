import type { NodeHandler } from '@server/live/nodes/types'

// Mirrors the legacy get_player branch: resolve userid, find the player in this
// server's shard group, or set an error object.
export const handler: NodeHandler = async (rc) => {
  const userid = rc.resolve(rc.param('userid'))
  if (userid) {
    const player = rc.findPlayerInServer((p: any) => p.userid === userid)
    rc.setContext(player || { error: 'player not found', userid })
  } else {
    rc.setContext({ error: 'no userid provided' })
  }
  return 'continue'
}
