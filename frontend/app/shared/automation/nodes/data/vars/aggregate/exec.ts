import type { NodeHandler } from '@server/live/nodes/types'

// Collect values into an array across loop/foreach iterations. The array lives in
// the run-scoped `vars` namespace (shared across the run, so it survives loop
// passes) and is readable via {{vars.<key>}}. The natural pair of loop/foreach,
// which otherwise only have side effects and never produce a list.
export const handler: NodeHandler = async (rc) => {
  if (!rc.context.vars) rc.context.vars = {}
  const vars = rc.context.vars as Record<string, any>

  const key = String(rc.resolve(rc.param('key', 'items')) ?? '').trim() || 'items'
  const op = String(rc.param('operation', 'push'))

  // Coerce the slot to an array (a non-array existing value is wrapped, not lost).
  if (!Array.isArray(vars[key])) vars[key] = vars[key] == null ? [] : [vars[key]]
  const arr = vars[key] as any[]

  if (op === 'reset') {
    arr.length = 0
  } else {
    // push (default)
    arr.push(rc.resolve(rc.param('value')))
  }

  rc.setContext({ array: arr, count: arr.length })
  return 'continue'
}
