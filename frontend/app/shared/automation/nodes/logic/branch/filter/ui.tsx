import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPERATORS = [
  { value: 'equals', label: '== Igual' },
  { value: 'not_equals', label: '!= Diferente' },
  { value: 'greater_than', label: '> Maior que' },
  { value: 'less_than', label: '< Menor que' },
  { value: 'contains', label: 'Contém' },
  { value: 'not_contains', label: 'Não contém' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'not_starts_with', label: 'Não começa com' },
  { value: 'ends_with', label: 'Termina com' },
  { value: 'exists', label: 'Existe' },
]

export const ui = function FilterNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const update = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, [key]: value })
  }, [id, data, updateNodeData])

  return (
    <BaseNode
      type="condition"
      icon="⛔"
      label="Filter"
      selected={selected}
      executionStatus={data._executionStatus}
      executionOutput={data._executionOutput}
      executionError={data._executionError}
      hasCaptureData={data._hasCaptureData}
      alias={data.alias}
      onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
    >
      <NodeField label="Continua só se">
        <NodeInput value={data.field || ''} onChange={v => update('field', v)} placeholder="{{trigger.campo}}" />
      </NodeField>
      <NodeField label="Operador">
        <NodeSelect value={data.operator || 'equals'} onChange={v => update('operator', v)} options={OPERATORS} />
      </NodeField>
      {data.operator !== 'exists' && (
        <NodeField label="Valor">
          <NodeInput value={data.value || ''} onChange={v => update('value', v)} placeholder="valor esperado" />
        </NodeField>
      )}
      <div className="text-[8px] text-gray-500 mt-1">Se não passar, o fluxo para aqui.</div>
    </BaseNode>
  )
}
