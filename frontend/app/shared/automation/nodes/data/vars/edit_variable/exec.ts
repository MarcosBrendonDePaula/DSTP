import type { NodeHandler } from '@server/live/nodes/types'

// Mutate the in-memory `vars` namespace on the flow context (read via {{vars.x}}).
// The engine seeds `context.vars = {}` on every run (and reinstates it after a
// wait), but we guard for it defensively. vars live for ONE flow run — for state
// that survives across runs, use the `memory` node instead.
export const handler: NodeHandler = async (rc) => {
  if (!rc.context.vars) rc.context.vars = {}
  const vars = rc.context.vars as Record<string, any>

  const key = String(rc.resolve(rc.param('key', '')) ?? '').trim()
  const op = String(rc.param('operation', 'set'))
  const raw = rc.resolve(rc.param('value', ''))

  if (!key) {
    rc.setContext({ error: 'edit_variable: no key', operation: op })
    return 'continue'
  }

  switch (op) {
    case 'set':
      vars[key] = raw
      break
    case 'inc':
      vars[key] = (Number(vars[key]) || 0) + (raw === '' || raw == null ? 1 : Number(raw) || 0)
      break
    case 'dec':
      vars[key] = (Number(vars[key]) || 0) - (raw === '' || raw == null ? 1 : Number(raw) || 0)
      break
    case 'append':
      if (Array.isArray(vars[key])) vars[key].push(raw)
      else if (typeof vars[key] === 'string') vars[key] = vars[key] + String(raw)
      else if (vars[key] == null) vars[key] = [raw]
      else vars[key] = [vars[key], raw]
      break
    case 'toggle':
      vars[key] = !vars[key]
      break
    case 'delete':
      delete vars[key]
      break
    default:
      vars[key] = raw
  }

  rc.setContext({ key, value: vars[key], operation: op })
  return 'continue'
}
