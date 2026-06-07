import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const MODES = [
  { value: 'while', label: 'enquanto (while) for verdadeira' },
  { value: 'until', label: 'até (until) ficar verdadeira' },
]

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

export const ui = function LoopNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const update = useCallback((key: string, value: any) => {
    updateNodeData(id, { ...data, [key]: value })
  }, [id, data, updateNodeData])
  const setParam = useCallback((key: string, value: any) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode
      type="condition"
      icon="🔄"
      label="Loop"
      selected={selected}
      executionStatus={data._executionStatus}
      executionOutput={data._executionOutput}
      executionError={data._executionError}
      hasCaptureData={data._hasCaptureData}
      alias={data.alias}
      onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
      outputLabels={[
        { id: 'body', label: '🔁 body' },
        { id: 'done', label: '✓ done' },
      ]}
    >
      <NodeField label="Repetir">
        <NodeSelect value={data.params?.mode || 'while'} onChange={v => setParam('mode', v)} options={MODES} />
      </NodeField>
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
      <div className="text-[8px] text-gray-500 mt-1 space-y-0.5">
        <div>No body: <code className="text-yellow-400">{'{{'}loop.index{'}}'}</code> · <code className="text-yellow-400">{'{{'}loop.iteration{'}}'}</code></div>
        <div>Ligue o corpo no <span className="text-yellow-400">body</span>; a saída, no <span className="text-gray-400">done</span>. Use Break para sair. Máx. 200 voltas.</div>
      </div>
    </BaseNode>
  )
}
