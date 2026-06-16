import type { Node, Edge } from '@xyflow/react'

// Simple left-to-right hierarchical auto-layout (no external dep). Assigns each
// node to a COLUMN by its longest distance from a root (a node with no incoming
// edge, e.g. a trigger), then stacks nodes vertically within each column. Good
// enough to "tidy up" a DST flow into readable lanes — like n8n's auto-arrange.
const COL_GAP = 120   // horizontal GAP between columns (added to the widest node in the left column)
const ROW_GAP = 40    // vertical GAP between stacked nodes (added to each node's real height)
const X0 = 80
const Y0 = 80
// Fallbacks when a node hasn't been measured yet (first layout before render).
const DEF_W = 200
const DEF_H = 90

// Real rendered size of a node (React Flow fills `measured` after layout; fall back to
// width/height or sane defaults so the first auto-layout still avoids overlaps).
function nodeSize(n: Node): { w: number; h: number } {
  const w = (n as any).measured?.width ?? (n as any).width ?? DEF_W
  const h = (n as any).measured?.height ?? (n as any).height ?? DEF_H
  return { w, h }
}

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

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  // Column X = accumulated width of all previous columns (their WIDEST node) + COL_GAP, so a
  // column of fat nodes pushes the next one further right (no horizontal overlap).
  const cols = [...byCol.keys()].sort((a, b) => a - b)
  const colX = new Map<number, number>()
  let x = X0
  for (const c of cols) {
    colX.set(c, x)
    let widest = DEF_W
    for (const id of byCol.get(c)!) widest = Math.max(widest, nodeSize(nodeById.get(id)!).w)
    x += widest + COL_GAP
  }

  // Within a column, stack by REAL height: y advances by each node's height + ROW_GAP, so a
  // tall node (wait with N inputs, ui_builder) never overlaps the one below it.
  const newPos = new Map<string, { x: number; y: number }>()
  for (const [c, arr] of byCol) {
    let y = Y0
    for (const id of arr) {
      newPos.set(id, { x: colX.get(c)!, y })
      y += nodeSize(nodeById.get(id)!).h + ROW_GAP
    }
  }

  return nodes.map(n => ({ ...n, position: newPos.get(n.id) ?? n.position }))
}
