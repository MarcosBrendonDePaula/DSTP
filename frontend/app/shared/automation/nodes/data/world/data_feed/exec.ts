import type { NodeHandler } from '@server/live/nodes/types'

// A comma/space/JSON list param → string[]; undefined when empty.
function list(v: any): string[] | undefined {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v !== 'string' || !v.trim()) return undefined
  const s = v.trim()
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String) } catch { /* fall through */ } }
  return s.split(/[\s,;]+/).filter(Boolean)
}

// data_feed: queues feed_start / feed_stop for the mod (DST_MOD/scripts/dstp/data_feed.lua).
export const handler: NodeHandler = async (rc) => {
  const op = String(rc.resolve(rc.param('operation', 'start')) || 'start')
  const userid = rc.resolve(rc.param('userid'))
  const id = String(rc.resolve(rc.param('id', 'mobs')) || 'mobs')
  if (op === 'stop') {
    rc.pushCommand('feed_stop', { userid, id })
  } else {
    const num = (k: string, d: number) => { const n = Number(rc.resolve(rc.param(k))); return Number.isFinite(n) && n > 0 ? n : d }
    rc.pushCommand('feed_start', {
      userid, id,
      prefabs: list(rc.resolve(rc.param('prefabs'))),
      tags: list(rc.resolve(rc.param('tags'))),
      fields: list(rc.resolve(rc.param('fields'))) ?? ['hp', 'hp_max'],
      radius: num('radius', 30),
      interval: num('interval', 0.5),
      max: num('max', 30),
    })
  }
  rc.setContext({ executed: true, operation: op, id })
  rc.executedActions.push(op === 'stop' ? 'feed_stop' : 'feed_start')
  return 'continue'
}
