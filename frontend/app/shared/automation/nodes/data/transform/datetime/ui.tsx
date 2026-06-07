import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPS = [
  { value: 'now', label: 'Agora (now)' },
  { value: 'format', label: 'Formatar (→ ISO)' },
  { value: 'add', label: 'Somar tempo' },
  { value: 'diff', label: 'Diferença' },
]
const UNITS = [
  { value: 'ms', label: 'ms' },
  { value: 'seconds', label: 'segundos' },
  { value: 'minutes', label: 'minutos' },
  { value: 'hours', label: 'horas' },
  { value: 'days', label: 'dias' },
]

export const ui = function DateTimeNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const op = data.params?.operation || 'now'

  return (
    <BaseNode type="action" icon="🕒" label="Date / Time" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Operação">
        <NodeSelect value={op} onChange={v => setParam('operation', v)} options={OPS} />
      </NodeField>
      {(op === 'format' || op === 'add' || op === 'diff') && (
        <NodeField label={op === 'diff' ? 'De (timestamp)' : 'Timestamp'}>
          <NodeInput value={data.params?.value || ''} onChange={v => setParam('value', v)} placeholder="vazio = agora · {{ref}}" />
        </NodeField>
      )}
      {op === 'diff' && (
        <NodeField label="Até (timestamp)">
          <NodeInput value={data.params?.value2 || ''} onChange={v => setParam('value2', v)} placeholder="vazio = agora · {{ref}}" />
        </NodeField>
      )}
      {op === 'add' && (
        <NodeField label="Quantidade">
          <NodeInput value={data.params?.amount || ''} onChange={v => setParam('amount', v)} placeholder="ex: 30 (negativo subtrai)" />
        </NodeField>
      )}
      {(op === 'add' || op === 'diff') && (
        <NodeField label="Unidade">
          <NodeSelect value={data.params?.unit || 'seconds'} onChange={v => setParam('unit', v)} options={UNITS} />
        </NodeField>
      )}
      <div className="text-[8px] text-gray-500 mt-1">Saída: <code className="text-cyan-400">{'{{'}node.value{'}}'}</code> · <code className="text-cyan-400">{'{{'}node.ms{'}}'}</code> · <code className="text-cyan-400">{'{{'}node.iso{'}}'}</code></div>
    </BaseNode>
  )
}
