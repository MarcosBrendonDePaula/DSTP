import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPS = [
  { value: 'uppercase', label: 'MAIÚSCULAS' },
  { value: 'lowercase', label: 'minúsculas' },
  { value: 'trim', label: 'Remover espaços' },
  { value: 'length', label: 'Tamanho' },
  { value: 'number', label: 'Para número' },
  { value: 'round', label: 'Arredondar' },
  { value: 'add', label: '+ Somar' },
  { value: 'sub', label: '- Subtrair' },
  { value: 'mul', label: '× Multiplicar' },
  { value: 'div', label: '÷ Dividir' },
  { value: 'json_parse', label: 'JSON → objeto' },
  { value: 'json_stringify', label: 'objeto → JSON' },
  { value: 'after', label: 'Texto depois de (separador)' },
  { value: 'before', label: 'Texto antes de (separador)' },
  { value: 'replace', label: 'Substituir trecho' },
]
const MATH = new Set(['add', 'sub', 'mul', 'div'])
// these also use the operand field (as a separator / substring, not a number)
const NEEDS_OPERAND = new Set(['add', 'sub', 'mul', 'div', 'after', 'before', 'replace'])

export const ui = function TransformNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const op = data.params?.operation || 'uppercase'

  return (
    <BaseNode type="action" icon="🔧" label="Transform" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Valor">
        <NodeInput value={data.params?.value || ''} onChange={v => setParam('value', v)} placeholder="{{trigger.name}}" />
      </NodeField>
      <NodeField label="Operação">
        <NodeSelect value={op} onChange={v => setParam('operation', v)} options={OPS} />
      </NodeField>
      {NEEDS_OPERAND.has(op) && (
        <NodeField label={MATH.has(op) ? 'Operando' : op === 'replace' ? 'Trecho a substituir' : 'Separador / trecho'}>
          <NodeInput value={data.params?.operand || ''} onChange={v => setParam('operand', v)} placeholder={MATH.has(op) ? 'número ou {{ref}}' : 'ex: ":"'} />
        </NodeField>
      )}
      {op === 'replace' && (
        <NodeField label="Substituir por">
          <NodeInput value={data.params?.replacement || ''} onChange={v => setParam('replacement', v)} placeholder="vazio = remover" />
        </NodeField>
      )}
      <div className="text-[8px] text-gray-500 mt-1">Saída: <code className="text-purple-400">{'{{'}node.value{'}}'}</code></div>
    </BaseNode>
  )
}
