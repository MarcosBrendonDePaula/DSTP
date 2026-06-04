import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function RandomNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="🎲" label="Random" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Lista (item aleatório)">
        <NodeInput value={data.params?.list || ''} onChange={v => setParam('list', v)} placeholder="deerclops,bearger,klaus ou {{node.lista}}" />
      </NodeField>
      <div className="text-[8px] text-gray-500 my-1">ou número entre min e max:</div>
      <div className="flex gap-1">
        <NodeInput value={data.params?.min || ''} onChange={v => setParam('min', v)} placeholder="min" />
        <NodeInput value={data.params?.max || ''} onChange={v => setParam('max', v)} placeholder="max" />
      </div>
      <div className="text-[8px] text-gray-500 mt-1">Saída: <code className="text-amber-400">{'{{'}node.value{'}}'}</code></div>
    </BaseNode>
  )
}
