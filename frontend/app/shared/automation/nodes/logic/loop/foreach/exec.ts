import type { NodeHandler } from '@server/live/nodes/types'

// Hard cap on items. DSTP is a DAG executor with a loop-guard (MAX_NODE_VISITS=50)
// that aborts a node revisited too many times; the each-branch nodes ARE revisited
// once per item, so we cap below that to fail with a clear message instead of
// tripping the guard mid-loop. Bounded iteration keeps a flow (and its resolved
// secrets) from being held alive indefinitely.
const MAX_ITEMS = 40

// For-each: resolve `list` to an array, run the "each" branch once per item with
// loop.item / loop.index in context, then follow the "done" branch.
//
// NESTING: `loop` lives on the shared context, so a foreach nested inside another
// foreach's each-branch would clobber the outer loop's item/index. We save the
// enclosing `loop` on entry and RESTORE it on every exit path (instead of a flat
// `delete`), so the outer loop's {{loop.item}}/{{loop.index}} survive after an
// inner loop returns. hadLoop distinguishes "no enclosing loop" from "loop was
// explicitly undefined" so we delete vs restore correctly.
export const handler: NodeHandler = async (rc) => {
  const raw = rc.resolve(rc.param('list'))
  const list: any[] = Array.isArray(raw) ? raw : []
  const count = Math.min(list.length, MAX_ITEMS)

  const hadLoop = Object.prototype.hasOwnProperty.call(rc.context, 'loop')
  const prevLoop = rc.context.loop
  const restoreLoop = () => {
    if (hadLoop) rc.context.loop = prevLoop
    else delete rc.context.loop
  }

  for (let i = 0; i < count; i++) {
    // Expose the current item to the each-branch as {{loop.item}}/{{loop.index}}.
    rc.context.loop = { item: list[i], index: i }
    const wait = await rc.followOutEdges((edge) => edge.sourceHandle === 'each')
    // If the each-branch hit a wait node, surface it (loops + wait don't mix, but
    // we don't silently swallow it). Stop iterating.
    if (wait) { restoreLoop(); return { wait } }
  }
  restoreLoop()

  rc.setContext({ count, truncated: list.length > MAX_ITEMS })
  return { followEdges: (edge) => edge.sourceHandle === 'done' }
}
