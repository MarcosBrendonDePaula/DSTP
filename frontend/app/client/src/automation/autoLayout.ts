import type { Node, Edge } from '@xyflow/react'

// Simple left-to-right hierarchical auto-layout (no external dep). Assigns each
// node to a COLUMN by its longest distance from a root (a node with no incoming
// edge, e.g. a trigger), then stacks nodes vertically within each column. Good
// enough to "tidy up" a DST flow into readable lanes — like n8n's auto-arrange.
const COL_GAP = 320   // horizontal spacing between columns
const ROW_GAP = 150   // vertical spacing between nodes in a column
const X0 = 80
const Y0 = 80

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes
  const ids = new Set(nodes.map(n => n.id))
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const id of ids) { incoming.set(id, []); outgoing.set(id, []) }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    outgoing.get(e.source)!.push(e.target)
    incoming.get(e.target)!.push(e.source)
  }

  // Roots = nodes with no incoming edge. If none (a cycle), fall back to all.
  const roots = nodes.filter(n => (incoming.get(n.id)!.length === 0)).map(n => n.id)
  const seeds = roots.length ? roots : [nodes[0].id]

  // Longest-path column (depth) via BFS layering, with a visit cap to avoid
  // runaway on cycles.
  const col = new Map<string, number>()
  for (const s of seeds) col.set(s, 0)
  let frontier = [...seeds]
  let guard = 0
  while (frontier.length && guard++ < nodes.length * 4) {
    const next: string[] = []
    for (const id of frontier) {
      const c = col.get(id) ?? 0
      for (const t of outgoing.get(id)!) {
        const nc = c + 1
        if ((col.get(t) ?? -1) < nc) { col.set(t, nc); next.push(t) }
      }
    }
    frontier = next
  }
  // Any node never reached (disconnected island) → put in column 0.
  for (const n of nodes) if (!col.has(n.id)) col.set(n.id, 0)

  // Group by column, preserve a stable order (current y, then id) so re-layouts
  // don't shuffle siblings randomly.
  const byCol = new Map<number, string[]>()
  for (const n of nodes) {
    const c = col.get(n.id)!
    if (!byCol.has(c)) byCol.set(c, [])
    byCol.get(c)!.push(n.id)
  }
  const posY = new Map(nodes.map(n => [n.id, n.position?.y ?? 0]))
  for (const arr of byCol.values()) arr.sort((a, b) => (posY.get(a)! - posY.get(b)!) || a.localeCompare(b))

  const newPos = new Map<string, { x: number; y: number }>()
  for (const [c, arr] of byCol) {
    arr.forEach((id, row) => {
      newPos.set(id, { x: X0 + c * COL_GAP, y: Y0 + row * ROW_GAP })
    })
  }

  return nodes.map(n => ({ ...n, position: newPos.get(n.id) ?? n.position }))
}
