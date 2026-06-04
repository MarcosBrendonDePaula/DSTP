import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function FindPlayerNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const onChange = useCallback((val: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, name: val } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="🔍" label="Find Player" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Nome do Player">
        <NodeInput value={data.params?.name || ''} onChange={onChange} placeholder="{{trigger.name}} ou nick" />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1 space-y-0.5">
        <div>🔍 Busca por nome (parcial, case-insensitive)</div>
        <div>📦 Retorna: userid, name, health, hunger, etc</div>
      </div>
    </BaseNode>
  )
}
