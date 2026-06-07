import type { NodeHandler } from '@server/live/nodes/types'

const UNIT_MS: Record<string, number> = {
  ms: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

// Resolve a param to an epoch-ms number; empty/invalid → now.
function toMs(raw: any, now: number): number {
  if (raw === '' || raw == null) return now
  const n = Number(raw)
  if (!Number.isNaN(n)) return n
  const parsed = Date.parse(String(raw)) // accept ISO strings too
  return Number.isNaN(parsed) ? now : parsed
}

// Date/time helper. Date.now()/new Date() are fine here (this is a backend node
// handler, NOT a workflow script — only Workflow scripts forbid Date.now()).
export const handler: NodeHandler = async (rc) => {
  const op = String(rc.param('operation', 'now'))
  const now = Date.now()

  switch (op) {
    case 'now': {
      rc.setContext({ ms: now, iso: new Date(now).toISOString(), value: now })
      break
    }
    case 'format': {
      const ms = toMs(rc.resolve(rc.param('value')), now)
      const iso = new Date(ms).toISOString()
      rc.setContext({ ms, iso, value: iso })
      break
    }
    case 'add': {
      const ms = toMs(rc.resolve(rc.param('value')), now)
      const amount = Number(rc.resolve(rc.param('amount'))) || 0
      const unit = String(rc.param('unit', 'seconds'))
      const result = ms + amount * (UNIT_MS[unit] ?? 1000)
      rc.setContext({ ms: result, iso: new Date(result).toISOString(), value: result })
      break
    }
    case 'diff': {
      const a = toMs(rc.resolve(rc.param('value')), now)
      const b = toMs(rc.resolve(rc.param('value2')), now)
      const unit = String(rc.param('unit', 'seconds'))
      const diff = (b - a) / (UNIT_MS[unit] ?? 1000)
      rc.setContext({ ms: b - a, iso: '', value: diff })
      break
    }
    default:
      rc.setContext({ ms: now, iso: new Date(now).toISOString(), value: now })
  }

  return 'continue'
}
