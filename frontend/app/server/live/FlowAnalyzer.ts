// FlowAnalyzer - Static graph analysis for automation flows
// Determines whether a flow is "simple" (no Wait nodes) or "stateful" (has Wait nodes)
// For each Wait node, finds which trigger nodes can reach it by walking backwards through edges

import type { FlowNode, FlowEdge } from '../db'

export interface FlowAnalysis {
  isSimple: boolean
  waitNodes: Array<{
    nodeId: string
    requiredTriggers: string[] // trigger node IDs that can reach this wait
  }>
}

const analysisCache = new Map<string, FlowAnalysis>()

export function analyzeFlow(flow: { nodes: FlowNode[]; edges: FlowEdge[] }): FlowAnalysis {
  const waitNodes = flow.nodes.filter(n => n.type === 'wait')
  if (waitNodes.length === 0) return { isSimple: true, waitNodes: [] }

  const result: FlowAnalysis = { isSimple: false, waitNodes: [] }
  for (const waitNode of waitNodes) {
    const reachableTriggers = findUpstreamTriggers(waitNode.id, flow.nodes, flow.edges)
    result.waitNodes.push({ nodeId: waitNode.id, requiredTriggers: reachableTriggers })
  }
  return result
}

function findUpstreamTriggers(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const triggers: string[] = []
  const visited = new Set<string>()

  function walk(currentId: string) {
    if (visited.has(currentId)) return
    visited.add(currentId)
    const node = nodes.find(n => n.id === currentId)
    if (node?.type === 'trigger') {
      triggers.push(currentId)
      return
    }
    // Walk backwards through edges
    for (const edge of edges) {
      if (edge.target === currentId) {
        walk(edge.source)
      }
    }
  }

  walk(nodeId)
  return triggers
}

export function invalidateAnalysis(flowId: string) {
  analysisCache.delete(flowId)
}

export function getAnalysis(flowId: string, flow: { nodes: FlowNode[]; edges: FlowEdge[] }): FlowAnalysis {
  if (!analysisCache.has(flowId)) {
    analysisCache.set(flowId, analyzeFlow(flow))
  }
  return analysisCache.get(flowId)!
}
