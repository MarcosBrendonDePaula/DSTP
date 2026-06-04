import type { NodeHandler } from '@server/live/nodes/types'
import { FlowMemoryRepository } from '@server/db'

// Mirrors the legacy memory branch: read/write/delete/read_all against the
// per-flow SQLite store. `flow` param overrides the namespace so flows can share.
export const handler: NodeHandler = async (rc) => {
  const memRepo = new FlowMemoryRepository(rc.serverId)
  const params = rc.node.data.params || {}
  const flowId = (params.flow && String(params.flow)) || rc.context._flowId || ''
  const action = rc.node.data.action || 'read'
  const key = rc.resolve(params.key || '')

  if (action === 'write' && key) {
    const value = rc.resolve(params.value)
    memRepo.set(flowId, String(key), value)
    rc.setContext({ action: 'write', key, value })
  } else if (action === 'read' && key) {
    const value = memRepo.get(flowId, String(key))
    rc.setContext({ action: 'read', key, value: value ?? null })
  } else if (action === 'delete' && key) {
    memRepo.delete(flowId, String(key))
    rc.setContext({ action: 'delete', key })
  } else if (action === 'read_all') {
    const all = memRepo.getAll(flowId)
    rc.setContext({ action: 'read_all', data: all })
  } else {
    rc.setContext({ error: 'invalid action or missing key' })
  }
  return 'continue'
}
