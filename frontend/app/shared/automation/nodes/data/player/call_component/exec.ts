import type { NodeHandler } from '@server/live/nodes/types'

// Send a call_component command to the mod: invoke `method` of `component` on the
// player with `args`. ADMIN-POWER (RCE-equivalent on the server) — gate it in the
// flow with a {{player.admin}} check. The mod resolves the "{{self}}" sentinel in
// args to the player entity.
export const handler: NodeHandler = async (rc) => {
  const userid = rc.resolve(rc.param('userid'))
  const component = String(rc.resolve(rc.param('component')) || '')
  const method = String(rc.resolve(rc.param('method')) || '')

  // args is a JSON array; resolve templates inside each element, but keep the
  // "{{self}}" sentinel literal (the mod replaces it).
  let args: any[] = []
  const raw = rc.param('args')
  if (Array.isArray(raw)) {
    args = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    try { args = JSON.parse(raw) } catch { args = [] }
  }
  args = args.map(a => (a === '{{self}}' ? a : rc.resolve(a)))

  if (userid && component && method) {
    rc.pushCommand('call_component', { userid, component, method, args })
  }
  rc.setContext({ called: !!(userid && component && method), component, method })
  return 'continue'
}
