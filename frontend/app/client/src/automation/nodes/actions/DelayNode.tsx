import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeInput } from '../BaseNode'

export function DelayNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const onChange = useCallback((val: string) => {
    updateNodeData(id, { ...data, delay_ms: val })
  }, [id, data, updateNodeData])

  const ms = Number(data.delay_ms || 3000)
  const display = ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`

  return (
    <BaseNode type="delay" icon="⏱" label={`Delay · ${display}`} selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Tempo (ms)">
        <NodeInput value={data.delay_ms || '3000'} onChange={onChange} placeholder="3000" />
      </NodeField>
      <div className="text-[9px] text-gray-500">
        = {display} de espera
      </div>
    </BaseNode>
  )
}
