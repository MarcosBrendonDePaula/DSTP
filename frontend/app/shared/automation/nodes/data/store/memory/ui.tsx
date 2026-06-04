import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function MemoryNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const update = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value }, action: key === 'action' ? value : data.action })
  }, [id, data, updateNodeData])

  const action = data.action || 'read'

  return (
    <BaseNode type="action" icon="💾" label="Memory" selected={selected}
      executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError}
      hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
    >
      <NodeField label="Acao">
        <NodeSelect value={action} onChange={v => updateNodeData(id, { ...data, action: v })} options={[
          { value: 'read', label: 'Ler valor' },
          { value: 'write', label: 'Escrever valor' },
          { value: 'delete', label: 'Deletar' },
          { value: 'read_all', label: 'Ler tudo' },
        ]} />
      </NodeField>
      {action !== 'read_all' && (
        <NodeField label="Chave">
          <NodeInput value={data.params?.key || ''} onChange={v => update('key', v)} placeholder="nome_da_chave" />
        </NodeField>
      )}
      {action === 'write' && (
        <NodeField label="Valor">
          <NodeInput value={data.params?.value || ''} onChange={v => update('value', v)} placeholder="{{trigger.userid}} ou texto" />
        </NodeField>
      )}
      <div className="text-[8px] text-gray-500 mt-1">
        Persistente no SQLite (sobrevive restart)
      </div>
    </BaseNode>
  )
}
