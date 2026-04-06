import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '../BaseNode'

export function WaitNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const update = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, [key]: value })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="wait" icon="🔀" label="Wait / Merge" selected={selected}
      executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError}
      hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
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
