import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPS = [
  { value: 'push', label: 'Adicionar (push)' },
  { value: 'reset', label: 'Zerar (reset)' },
]

export const ui = function AggregateNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const op = data.params?.operation || 'push'

  return (
    <BaseNode type="action" icon="📥" label="Aggregate" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Lista (nome)">
        <NodeInput value={data.params?.key || ''} onChange={v => setParam('key', v)} placeholder="ex: coletados" />
      </NodeField>
      <NodeField label="Operação">
        <NodeSelect value={op} onChange={v => setParam('operation', v)} options={OPS} />
      </NodeField>
      {op === 'push' && (
        <NodeField label="Valor">
          <NodeInput value={data.params?.value || ''} onChange={v => setParam('value', v)} placeholder="{{loop.item}}" />
        </NodeField>
      )}
      <div className="text-[8px] text-gray-500 mt-1">Lê com <code className="text-purple-400">{'{{'}vars.{data.params?.key || 'lista'}{'}}'}</code> · saída <code className="text-purple-400">{'{{'}node.array{'}}'}</code></div>
    </BaseNode>
  )
}
