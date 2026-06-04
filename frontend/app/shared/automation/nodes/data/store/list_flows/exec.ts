import type { NodeHandler } from '@server/live/nodes/types'
import { FlowRepository } from '@server/db'

// List the server's flows so a flow can introspect the others — e.g. a !help
// command that auto-discovers every "!cmd — descrição" flow without a hand-kept
// list. Keeps each command isolated in its own flow yet still discoverable.
// Filters: onlyEnabled, folder (exact path), startsWith (name prefix).
export const handler: NodeHandler = async (rc) => {
  const repo = new FlowRepository(rc.serverId)
  const onlyEnabled = rc.param('onlyEnabled') !== 'false'
  const folder = String(rc.resolve(rc.param('folder')) || '').trim()
  const prefix = String(rc.resolve(rc.param('startsWith')) || '')

  let rows = repo.findAll()
  if (onlyEnabled) rows = rows.filter(f => f.enabled)
  if (folder) rows = rows.filter(f => (f.folderPath ?? '') === folder)
  if (prefix) rows = rows.filter(f => (f.name ?? '').startsWith(prefix))

  // Exclude self so a !help flow doesn't list itself unless it matches the filter
  // naturally (it usually won't, since help isn't typically named with the prefix).
  const flows = rows.map(f => ({
    name: f.name,
    enabled: !!f.enabled,
    folderPath: f.folderPath ?? '',
    nodeCount: Array.isArray(f.nodes) ? f.nodes.length : 0,
    edgeCount: Array.isArray(f.edges) ? f.edges.length : 0,
  }))
  const names = flows.map(f => f.name)

  rc.setContext({
    flows,
    names,
    count: flows.length,
    text: names.join('\n'),
  })
  return 'continue'
}
