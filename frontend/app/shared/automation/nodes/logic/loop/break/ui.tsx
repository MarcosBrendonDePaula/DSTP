import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPERATORS = [
  { value: 'equals', label: '== Igual' },
  { value: 'not_equals', label: '!= Diferente' },
  { value: 'greater_than', label: '> Maior que' },
  { value: 'less_than', label: '< Menor que' },
  { value: 'contains', label: 'Contém' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'ends_with', label: 'Termina com' },
  { value: 'exists', label: 'Existe' },
]

export const ui = function BreakNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const update = useCallback((key: string, value: any) => {
    updateNodeData(id, { ...data, [key]: value })
  }, [id, data, updateNodeData])
  const setParam = useCallback((key: string, value: any) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const conditional = data.params?.conditional === true || data.params?.conditional === 'true'

  return (
    <BaseNode type="action" icon="⏹️" label="Break" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <label className="flex items-center gap-1 text-[9px] text-gray-400 cursor-pointer">
        <input type="checkbox" checked={conditional} onChange={e => setParam('conditional', e.target.checked)} />
        Só quebrar sob condição
      </label>
      {conditional && (
        <>
          <NodeField label="Campo">
            <NodeInput value={data.field || ''} onChange={v => update('field', v)} placeholder="{{vars.contador}}" />
          </NodeField>
          <NodeField label="Operador">
            <NodeSelect value={data.operator || ''} onChange={v => update('operator', v)} options={OPERATORS} />
          </NodeField>
          {data.operator !== 'exists' && (
            <NodeField label="Valor">
              <NodeInput value={data.value || ''} onChange={v => update('value', v)} placeholder="valor" />
            </NodeField>
          )}
        </>
      )}
      <div className="text-[8px] text-gray-500 mt-1">Interrompe o loop mais próximo.</div>
    </BaseNode>
  )
}
