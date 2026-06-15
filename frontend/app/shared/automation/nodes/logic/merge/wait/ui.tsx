import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function WaitNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const update = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, [key]: value })
  }, [id, data, updateNodeData])

  // N input handles (Entrada 1..N) so it visually joins several paths, n8n-style.
  // The engine counts ARRIVING EDGES, so this is an affordance — connect any branch
  // to any input. Default 2; configurable 2..5.
  const inputCount = Math.min(5, Math.max(2, Number(data.inputs) || 2))
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
      <NodeField label="Número de entradas">
        <NodeSelect value={String(inputCount)} onChange={v => update('inputs', v)} options={[
          { value: '2', label: '2 entradas' },
          { value: '3', label: '3 entradas' },
          { value: '4', label: '4 entradas' },
          { value: '5', label: '5 entradas' },
        ]} />
      </NodeField>
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
