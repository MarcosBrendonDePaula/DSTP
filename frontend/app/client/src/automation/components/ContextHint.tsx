// Shows available context variables as hints in node fields
import { useMemo, useState } from 'react'
import { useNodes, useEdges } from '@xyflow/react'
import { triggerOutputSchemas, nodeOutputSchemas } from '../nodeOutputSchemas'

interface ContextHintProps {
  currentNodeId: string
  onInsert?: (variable: string) => void
}

export function ContextHint({ currentNodeId, onInsert }: ContextHintProps) {
  const allNodes = useNodes()
  const allEdges = useEdges()
  const [open, setOpen] = useState(false)

  const variables = useMemo(() => {
    const vars: Array<{ path: string; type: string; description: string; source: string }> = []

    // Find upstream nodes
    const upstreamIds = new Set<string>()
    const findUpstream = (nodeId: string) => {
      for (const edge of allEdges) {
        if (edge.target === nodeId && !upstreamIds.has(edge.source)) {
          upstreamIds.add(edge.source)
          findUpstream(edge.source)
        }
      }
    }
    findUpstream(currentNodeId)

    // Trigger variables
    const triggerNode = allNodes.find(n => n.type === 'trigger')
    if (triggerNode) {
      const eventType = triggerNode.data?.event_type as string
      const schema = triggerOutputSchemas[eventType]
      if (schema) {
        for (const f of schema.fields) {
          vars.push({
            path: `trigger.${f.name}`,
            type: f.type,
            description: f.description,
            source: `⚡ ${eventType}`,
          })
        }
      }
    }

    // Upstream node variables
    for (const node of allNodes) {
      if (!upstreamIds.has(node.id) || node.id === currentNodeId) continue
      const nodeType = node.type || 'unknown'
      const schema = nodeOutputSchemas[nodeType]
      if (!schema) continue

      const label = (node.data as any)?.action_type || nodeType
      for (const f of schema.fields) {
        vars.push({
          path: `${node.id}.${f.name}`,
          type: f.type,
          description: f.description,
          source: `${label}`,
        })
      }
    }

    return vars
  }, [allNodes, allEdges, currentNodeId])

  if (variables.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-[8px] text-blue-400 hover:text-blue-300 transition-colors"
      >
        {open ? '▾' : '▸'} {variables.length} variáveis disponíveis
      </button>
      {open && (
        <div className="mt-1 max-h-[120px] overflow-auto rounded-md bg-black/40 border border-white/5 p-1.5">
          {variables.map((v, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-white/5 cursor-pointer text-[9px]"
              onClick={() => { onInsert?.(`{{${v.path}}}`); setOpen(false) }}
              title={v.description}
            >
              <code className="text-purple-400 font-mono">{`{{${v.path}}}`}</code>
              <span className="text-gray-600">{v.type}</span>
              <span className="text-gray-700 ml-auto">{v.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
