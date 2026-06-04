import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput, NodeSelect, useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function SplitNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="✂" label="Split" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Texto">
        <NodeInput value={data.params?.value ?? '{{chat.message}}'} onChange={v => setParam('value', v)} placeholder="{{chat.message}}" />
      </NodeField>
      <NodeField label="Separador (vazio = espaços)">
        <NodeInput value={data.params?.separator || ''} onChange={v => setParam('separator', v)} placeholder="(espaço)" />
      </NodeField>
      <NodeField label="Limpar partes vazias">
        <NodeSelect
          value={data.params?.trim === 'false' ? 'false' : 'true'}
          onChange={v => setParam('trim', v)}
          options={[{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]}
        />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1">
        Saída: <code className="text-purple-400">{'{{'}node.part1{'}}'}</code>, <code className="text-purple-400">part2</code>, <code className="text-purple-400">rest</code>, <code className="text-purple-400">count</code>
      </div>
    </BaseNode>
  )
}
