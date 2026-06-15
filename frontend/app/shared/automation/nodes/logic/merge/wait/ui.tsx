import { useCallback } from 'react'
import { useStore } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function WaitNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const update = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, [key]: value })
  }, [id, data, updateNodeData])

  // Dynamic input handles (n8n-style): always one FREE input beyond what's already
  // connected, so the merge grows as you wire branches in — no manual count. The
  // engine just counts arriving edges, so these are purely a visual affordance.
  const connectedInputs = useStore((s) => {
    const targets = new Set<string>()
    for (const e of s.edges) if (e.target === id) targets.add(e.targetHandle || 'in1')
    return targets.size
  })
  const inputCount = Math.max(2, connectedInputs + 1)
  const inputLabels = Array.from({ length: inputCount }, (_, i) => ({ id: `in${i + 1}`, label: `Entrada ${i + 1}` }))

  return (
    <BaseNode type="wait" icon="🔀" label="Wait / Merge" selected={selected}
      executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError}
      hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
      inputLabels={inputLabels}
      outputLabels={data.timeoutAction === 'timeout_branch' ? [
        { id: 'continue', label: '✅ OK' },
        { id: 'timeout', label: '⏰ Timeout' },
      ] : undefined}
    >
      <NodeField label="Modo">
        <NodeSelect value={data.mode || 'all'} onChange={v => update('mode', v)} options={[
          { value: 'all', label: 'Esperar todos' },
          { value: 'any', label: 'Qualquer um' },
        ]} />
      </NodeField>
      <NodeField label="Correlação">
        <NodeSelect value={data.correlation || 'broadcast'} onChange={v => update('correlation', v)} options={[
          { value: 'broadcast', label: 'Broadcast (qualquer)' },
          { value: 'correlation_key', label: 'Por campo' },
          { value: 'all_to_one', label: 'Todos de uma vez' },
        ]} />
      </NodeField>
      {data.correlation === 'correlation_key' && (
        <NodeField label="Chave de correlação">
          <NodeInput value={data.correlationExpression || ''} onChange={v => update('correlationExpression', v)} placeholder="{{trigger.userid}}" />
        </NodeField>
      )}
      <NodeField label="Timeout (ms)">
        <NodeInput value={data.timeoutMs || '300000'} onChange={v => update('timeoutMs', v)} placeholder="300000 (5min)" />
      </NodeField>
      <NodeField label="Ao expirar">
        <NodeSelect value={data.timeoutAction || 'discard'} onChange={v => update('timeoutAction', v)} options={[
          { value: 'discard', label: 'Descartar' },
          { value: 'timeout_branch', label: 'Branch timeout' },
        ]} />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1">
        Espera branches chegarem antes de continuar
      </div>
    </BaseNode>
  )
}
