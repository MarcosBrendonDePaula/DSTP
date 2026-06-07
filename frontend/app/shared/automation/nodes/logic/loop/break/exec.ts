import type { NodeHandler } from '@server/live/nodes/types'

// Break out of the nearest enclosing loop. Signals via context._break, which the
// loop handler checks after each body pass. Returns 'stop' so we don't follow any
// edges. If `conditional` is set and its condition is false, it does NOT break and
// continues the body normally. A break outside a loop is a harmless no-op (the
// flag is cleared at the start of each loop, and with no loop nothing consumes it).
export const handler: NodeHandler = async (rc) => {
  const conditional = rc.param('conditional', false) === true || rc.param('conditional') === 'true'
  const fire = !conditional || rc.evaluateCondition()
  rc.setContext({ broke: fire })
  if (!fire) return 'continue'
  ;(rc.context as any)._break = true
  return 'stop'
}
