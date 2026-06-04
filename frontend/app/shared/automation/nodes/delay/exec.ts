import type { NodeHandler } from '@server/live/nodes/types'

// Upper bound for a delay node (1h). Prevents a flow holding an execution + its
// resolved-secret context alive indefinitely. (Mirrors the engine's old constant.)
const MAX_DELAY_MS = 60 * 60 * 1000

export const handler: NodeHandler = async (rc) => {
  // Mirror the legacy `||` fallback (0/'' fall through to '1000'), not `??`.
  const raw = Number(rc.resolve(rc.param('delay_ms') || '1000'))
  // Clamp: no negative/NaN, capped at MAX_DELAY_MS.
  const ms = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), MAX_DELAY_MS) : 0
  rc.setContext({ delayed: true, ms })
  await new Promise(resolve => setTimeout(resolve, ms))
  return 'continue'
}
