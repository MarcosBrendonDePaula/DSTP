import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function ListAllPlayersNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  return (
    <BaseNode type="action" icon="👥" label="List Players" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>

      <div className="text-[8px] text-gray-500 mt-1">👥 Retorna: players[], userids[], count</div>
    </BaseNode>
  )
}
