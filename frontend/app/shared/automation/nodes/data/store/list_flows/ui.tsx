import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput, NodeSelect, useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function ListFlowsNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="📜" label="List Flows" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Só os ativos">
        <NodeSelect
          value={data.params?.onlyEnabled === 'false' ? 'false' : 'true'}
          onChange={v => setParam('onlyEnabled', v)}
          options={[{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]}
        />
      </NodeField>
      <NodeField label="Pasta (vazio = todas)">
        <NodeInput value={data.params?.folder || ''} onChange={v => setParam('folder', v)} placeholder="Comandos" />
      </NodeField>
      <NodeField label="Nome começa com">
        <NodeInput value={data.params?.startsWith || ''} onChange={v => setParam('startsWith', v)} placeholder="!" />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1">
        Saída: <code className="text-sky-400">{'{{'}node.text{'}}'}</code> (lista), <code className="text-sky-400">names</code>, <code className="text-sky-400">flows</code>, <code className="text-sky-400">count</code>
      </div>
    </BaseNode>
  )
}
