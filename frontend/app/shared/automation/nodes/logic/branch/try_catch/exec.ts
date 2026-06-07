import type { NodeHandler } from '@server/live/nodes/types'

// Error boundary. Runs the `try` branch inside a try/catch: a node that throws
// (http_request failure, script error, call_component blow-up) would otherwise
// propagate up processNode and abort the whole flow. Here we catch it, expose the
// message as {{<node>.error}}, and follow the `catch` branch instead.
//
// Flow control: the `try` branch is executed HERE (via followOutEdges). So on
// success we return 'stop' — the dispatcher must NOT follow edges again (the try
// branch already ran, and we don't want to re-run it or the catch). On failure we
// return a followEdges filter that runs ONLY the `catch` branch.
export const handler: NodeHandler = async (rc) => {
  let wait = null
  try {
    wait = await rc.followOutEdges((edge) => edge.sourceHandle === 'try')
    rc.setContext({ ok: true, error: '' })
  } catch (err: any) {
    const message = String(err?.message ?? err)
    rc.setContext({ ok: false, error: message })
    return { followEdges: (edge) => edge.sourceHandle === 'catch' }
  }
  // A wait node inside the try branch bubbles up (try/catch + wait don't mix).
  if (wait) return { wait }
  return 'stop'
}
