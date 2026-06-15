import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function GetServerInfoNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  return (
    <BaseNode type="action" icon="🖥" label="Get Server Info" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>

      <div className="text-[8px] text-gray-500 mt-1">🖥 Retorna: day, season, phase, players, uptime</div>
    </BaseNode>
  )
}
