import type { NodeHandler } from '@server/live/nodes/types'
import { stripCommandPrefix } from '@server/live/expressions'

// Mirrors the legacy find_player branch: resolve name, strip a leading command
// prefix (#tp, !kick…), case-insensitive substring match against player names.
export const handler: NodeHandler = async (rc) => {
  let searchName = String(rc.resolve(rc.param('name')) || '')
  searchName = stripCommandPrefix(searchName)
  if (searchName) {
    const needle = searchName.toLowerCase()
    const player = rc.findPlayerInServer((p: any) =>
      p.name && p.name.toLowerCase().includes(needle),
    )
    rc.setContext(player || { error: 'player not found', search: searchName })
  } else {
    rc.setContext({ error: 'no name provided' })
  }
  return 'continue'
}
