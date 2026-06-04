import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'

export const ui = function ForEachNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const setList = useCallback((list: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, list } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode
      type="condition"
      icon="🔁"
      label="For Each"
      selected={selected}
      executionStatus={data._executionStatus}
      executionOutput={data._executionOutput}
      executionError={data._executionError}
      hasCaptureData={data._hasCaptureData}
      alias={data.alias}
      onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
      outputLabels={[
        { id: 'each', label: '🔁 each' },
        { id: 'done', label: '✓ done' },
      ]}
    >
      <NodeField label="Lista">
        <NodeInput value={data.params?.list || ''} onChange={setList} placeholder="{{getPlayers.players}}" />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1 space-y-0.5">
        <div>Cada item: <code className="text-yellow-400">{'{{'}loop.item{'}}'}</code> · <code className="text-yellow-400">{'{{'}loop.index{'}}'}</code></div>
        <div>Ligue a sub-cadeia no handle <span className="text-yellow-400">each</span>; o resto, no <span className="text-gray-400">done</span>. Máx. 40 itens.</div>
      </div>
    </BaseNode>
  )
}
