import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeInput } from '../BaseNode'

export function GetPlayerNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const onChange = useCallback((val: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, userid: val } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="👤" label="Get Player" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="User ID">
        <NodeInput value={data.params?.userid || ''} onChange={onChange} placeholder="{{trigger.userid}}" />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1 space-y-0.5">
        <div>📦 Retorna: name, prefab, health, hunger,</div>
        <div>sanity, position, inventory, buffs, age</div>
      </div>
    </BaseNode>
  )
}
