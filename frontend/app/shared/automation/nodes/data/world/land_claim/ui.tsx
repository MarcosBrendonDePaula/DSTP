import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput, useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPERATIONS = [
  { value: 'add', label: '🛡 Criar claim' },
  { value: 'remove', label: '❌ Remover claim' },
  { value: 'trust', label: '🤝 Autorizar amigo' },
  { value: 'list', label: '📋 Listar claims' },
  { value: 'check', label: '❓ Consultar ponto' },
]

export const ui = function LandClaimNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const op = data.params?.operation || 'add'
  const needsUser = op !== 'list'
  const needsRadius = op === 'add'
  const needsFriend = op === 'trust'

  return (
    <BaseNode type="action" icon="🛡" label="Land Claim" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Operação">
        <NodeSelect value={op} onChange={v => setParam('operation', v)} options={OPERATIONS} />
      </NodeField>

      {needsUser && (
        <NodeField label="Player (posição/dono)">
          <NodeInput value={data.params?.userid ?? '{{trigger.userid}}'} onChange={v => setParam('userid', v)} placeholder="{{trigger.userid}}" />
        </NodeField>
      )}

      {needsRadius && (
        <NodeField label="Raio">
          <NodeInput value={data.params?.radius || ''} onChange={v => setParam('radius', v)} placeholder="20" />
        </NodeField>
      )}

      {needsFriend && (
        <>
          <NodeField label="Amigo (userid)">
            <NodeInput value={data.params?.friend || ''} onChange={v => setParam('friend', v)} placeholder="KU_..." />
          </NodeField>
          <NodeField label="Ação">
            <NodeSelect
              value={data.params?.on === 'false' ? 'false' : 'true'}
              onChange={v => setParam('on', v)}
              options={[{ value: 'true', label: 'Autorizar' }, { value: 'false', label: 'Revogar' }]}
            />
          </NodeField>
        </>
      )}

      <div className="text-[8px] text-gray-500 mt-1">
        x/z em branco = posição atual do player. Política (quem pode) é no fluxo.
      </div>
    </BaseNode>
  )
}
