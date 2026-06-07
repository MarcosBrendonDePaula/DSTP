import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPS = [
  { value: 'set', label: 'Definir (set)' },
  { value: 'inc', label: '+ Incrementar' },
  { value: 'dec', label: '− Decrementar' },
  { value: 'append', label: 'Anexar (append)' },
  { value: 'toggle', label: 'Inverter (toggle)' },
  { value: 'delete', label: 'Apagar (delete)' },
]
// toggle/delete don't take a value
const NEEDS_VALUE = new Set(['set', 'inc', 'dec', 'append'])

export const ui = function EditVariableNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const op = data.params?.operation || 'set'
  const valueLabel = op === 'inc' || op === 'dec' ? 'Quantidade' : 'Valor'

  return (
    <BaseNode type="action" icon="✏️" label="Edit Variable" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Variável">
        <NodeInput value={data.params?.key || ''} onChange={v => setParam('key', v)} placeholder="ex: contador" />
      </NodeField>
      <NodeField label="Operação">
        <NodeSelect value={op} onChange={v => setParam('operation', v)} options={OPS} />
      </NodeField>
      {NEEDS_VALUE.has(op) && (
        <NodeField label={valueLabel}>
          <NodeInput value={data.params?.value || ''} onChange={v => setParam('value', v)} placeholder={op === 'inc' || op === 'dec' ? '1 (padrão)' : 'valor ou {{ref}}'} />
        </NodeField>
      )}
      <div className="text-[8px] text-gray-500 mt-1">Lê com <code className="text-purple-400">{'{{'}vars.{data.params?.key || 'chave'}{'}}'}</code></div>
    </BaseNode>
  )
}
