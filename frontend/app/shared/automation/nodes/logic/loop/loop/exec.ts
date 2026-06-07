import type { NodeHandler } from '@server/live/nodes/types'
import type { FlowEdge } from '@server/db'

// Hard cap on iterations — the real bound on the loop. The engine's loop-guard
// (MAX_NODE_VISITS) would otherwise abort the body's nodes after ~50 revisits, so
// the handler resets the body's visit counts each iteration (rc.resetVisits) and
// relies on THIS cap instead. Keep it well below a pathological runaway.
const MAX_LOOP_ITERATIONS = 200

// BFS the nodes reachable from this loop's `body` handle, so we can reset only the
// body subgraph's guard counts between iterations (never the loop itself, never the
// rest of the flow). Edges with any handle are followed AFTER the first `body` hop.
function collectBodyIds(loopId: string, edges: FlowEdge[]): string[] {
  const seen = new Set<string>()
  const queue: string[] = edges
    .filter((e) => e.source === loopId && e.sourceHandle === 'body')
    .map((e) => e.target)
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id) || id === loopId) continue
    seen.add(id)
    for (const e of edges.filter((e) => e.source === id)) queue.push(e.target)
  }
  return [...seen]
}

export const handler: NodeHandler = async (rc) => {
  const mode = String(rc.param('mode', 'while'))
  const bodyIds = collectBodyIds(rc.node.id, rc.edges)

  // {{loop.index}} is a shared context key (foreach uses it too) — save/restore the
  // enclosing loop so a loop nested in another loop's/foreach's body doesn't clobber it.
  const hadLoop = Object.prototype.hasOwnProperty.call(rc.context, 'loop')
  const prevLoop = rc.context.loop
  const restoreLoop = () => {
    if (hadLoop) rc.context.loop = prevLoop
    else delete rc.context.loop
  }

  // Clear any break flag left over from an outer loop that already consumed it.
  delete (rc.context as any)._break

  let i = 0
  let stoppedBy: 'condition' | 'break' | 'cap' | 'wait' = 'cap'

  for (; i < MAX_LOOP_ITERATIONS; i++) {
    rc.context.loop = { index: i, iteration: i + 1, item: prevLoop?.item }

    const cond = rc.evaluateCondition()
    const shouldContinue = mode === 'until' ? !cond : cond
    if (!shouldContinue) { stoppedBy = 'condition'; break }

    const wait = await rc.followOutEdges((edge) => edge.sourceHandle === 'body')
    if (wait) {
      // A wait node inside a loop body isn't supported (the loop can't resume after
      // the pause) — surface it and stop, like foreach does.
      restoreLoop()
      rc.setContext({ iterations: i + 1, stoppedBy: 'wait', index: i })
      return { wait }
    }

    if ((rc.context as any)._break) {
      delete (rc.context as any)._break
      stoppedBy = 'break'
      i++ // this iteration's body did run
      break
    }

    // Re-arm the body subgraph for the next pass so the loop-guard doesn't trip.
    rc.resetVisits(bodyIds)
  }

  restoreLoop()
  rc.setContext({ iterations: i, stoppedBy, index: i })
  return { followEdges: (edge) => edge.sourceHandle === 'done' }
}
