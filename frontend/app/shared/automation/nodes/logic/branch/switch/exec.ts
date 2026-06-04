import type { NodeHandler } from '@server/live/nodes/types'

// Switch/case by value. Resolve `field`, compare (string-equality, like the
// condition node's equals) against each case's resolved value, and follow the
// matching case's handle ("case_<i>"). If none match, follow "default". Returns
// { followEdges } so the dispatcher traces before following (like condition).
export const handler: NodeHandler = async (rc) => {
  const cases: any[] = Array.isArray(rc.node.data.cases) ? rc.node.data.cases : []
  const actual = String(rc.resolve(rc.node.data.field))

  let matched = 'default'
  for (let i = 0; i < cases.length; i++) {
    if (String(rc.resolve(cases[i]?.value)) === actual) {
      matched = `case_${i}`
      break
    }
  }

  rc.setContext({ matched, value: actual })
  return { followEdges: (edge) => edge.sourceHandle === matched }
}
