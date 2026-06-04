import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function LogNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const onChange = useCallback((message: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, message } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="📋" label="Log" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Mensagem">
        <NodeInput value={data.params?.message || ''} onChange={onChange} placeholder="debug: {{trigger.userid}} entrou" />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1">Aparece no log do servidor. Não afeta o fluxo.</div>
    </BaseNode>
  )
}
