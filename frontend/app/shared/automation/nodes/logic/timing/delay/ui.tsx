import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

// Canvas render for the delay node. Reads from params.delay_ms (new) but falls
// back to the legacy flat data.delay_ms so old flows still display correctly.
export const ui = function DelayNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const value = data.params?.delay_ms ?? data.delay_ms ?? '1000'

  const onChange = useCallback((val: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, delay_ms: val } })
  }, [id, data, updateNodeData])

  const ms = Number(value || 1000)
  const display = ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`

  return (
    <BaseNode type="delay" icon="⏱" label={`Delay · ${display}`} selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Tempo (ms)">
        <NodeInput value={value} onChange={onChange} placeholder="1000" />
      </NodeField>
      <div className="text-[9px] text-gray-500">
        = {display} de espera
      </div>
    </BaseNode>
  )
}
