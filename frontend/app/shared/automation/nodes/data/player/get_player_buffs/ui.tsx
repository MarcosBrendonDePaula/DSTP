import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function GetPlayerBuffsNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  return (
    <BaseNode type="action" icon="✨" label="Get Buffs" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="User ID">
        <NodeInput value={data.params?.userid || ''} onChange={v => updateNodeData(id, { ...data, params: { ...data.params, userid: v } })} placeholder="{{trigger.userid}}" />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1">✨ Retorna: moisture, temperature, is_ghost, mightiness...</div>
    </BaseNode>
  )
}
