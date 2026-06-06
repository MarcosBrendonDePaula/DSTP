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

const COMMON_FIELDS = [
  { value: 'userid', label: 'User ID' },
  { value: 'name', label: 'Player Name' },
  { value: 'prefab', label: 'Character' },
  { value: 'cause', label: 'Death Cause' },
  { value: 'victim', label: 'Victim' },
  { value: 'attacker', label: 'Attacker' },
  { value: 'damage', label: 'Damage' },
  { value: 'item', label: 'Item' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'message', label: 'Message' },
  { value: 'phase', label: 'Phase' },
  { value: 'season', label: 'Season' },
  { value: 'day', label: 'Day' },
]

export const ui = function ConditionNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const update = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, [key]: value })
  }, [id, data, updateNodeData])

  return (
    <BaseNode
      type="condition"
      icon="❓"
      label="Condição"
      selected={selected}
      executionStatus={data._executionStatus}
      executionOutput={data._executionOutput}
      executionError={data._executionError}
      hasCaptureData={data._hasCaptureData}
      alias={data.alias}
      onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
      outputLabels={[
        { id: 'true', label: '✅ True' },
        { id: 'false', label: '❌ False' },
      ]}
    >
      <NodeField label="Campo">
        <div className="flex gap-1">
          <NodeSelect value={COMMON_FIELDS.find(f => f.value === data.field) ? data.field : ''} onChange={v => update('field', v)} options={COMMON_FIELDS} />
          <NodeInput value={data.field || ''} onChange={v => update('field', v)} placeholder="ou {{alias.campo}}" />
        </div>
      </NodeField>
      <NodeField label="Operador">
        <NodeSelect value={data.operator || ''} onChange={v => update('operator', v)} options={OPERATORS} />
      </NodeField>
      {data.operator !== 'exists' && (
        <NodeField label="Valor">
          <NodeInput value={data.value || ''} onChange={v => update('value', v)} placeholder="valor esperado" />
        </NodeField>
      )}
    </BaseNode>
  )
}
