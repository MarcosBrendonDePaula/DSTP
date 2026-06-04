import type { NodeHandler } from '@server/live/nodes/types'

// Random pick. If `list` resolves to an array (or comma-separated string), pick a
// random element. Otherwise, if min/max are set, pick a random integer in [min,max].
export const handler: NodeHandler = async (rc) => {
  const rawList = rc.resolve(rc.param('list'))
  let list: any[] | null = null
  if (Array.isArray(rawList)) list = rawList
  else if (typeof rawList === 'string' && rawList.trim()) list = rawList.split(',').map(s => s.trim())

  if (list && list.length) {
    const index = Math.floor(Math.random() * list.length)
    rc.setContext({ value: list[index], index })
    return 'continue'
  }

  const min = Math.ceil(Number(rc.resolve(rc.param('min'))) || 0)
  const max = Math.floor(Number(rc.resolve(rc.param('max'))) || 0)
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const value = lo + Math.floor(Math.random() * (hi - lo + 1))
  rc.setContext({ value, index: -1 })
  return 'continue'
}
