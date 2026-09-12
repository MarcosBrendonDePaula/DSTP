import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput, useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const OPERATIONS = [
  { value: 'start', label: '📡 Iniciar feed' },
  { value: 'stop', label: '⏹ Parar feed' },
  { value: 'set', label: '✏️ Gravar valor numa entidade (data.<nome>)' },
]

export const ui = function DataFeedNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])
  const p = data.params || {}
  const op = p.operation || 'start'

  return (
    <BaseNode type="action" icon="📡" label="Data Feed" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Operação">
        <NodeSelect value={op} onChange={v => setParam('operation', v)} options={OPERATIONS} />
      </NodeField>
      {op === 'set' ? (
        <>
          <NodeField label="GUID da entidade">
            <NodeInput value={p.guid ?? '{{trigger.guid}}'} onChange={v => setParam('guid', v)} placeholder="{{trigger.guid}}" />
          </NodeField>
          <NodeField label="Nome (vira data.<nome>)">
            <NodeInput value={p.name ?? ''} onChange={v => setParam('name', v)} placeholder="bounty" />
          </NodeField>
          <NodeField label="Valor (vazio = limpar)">
            <NodeInput value={p.value ?? ''} onChange={v => setParam('value', v)} placeholder="150" />
          </NodeField>
        </>
      ) : (
        <>
          <NodeField label="Player">
            <NodeInput value={p.userid ?? '{{trigger.userid}}'} onChange={v => setParam('userid', v)} placeholder="{{trigger.userid}}" />
          </NodeField>
          <NodeField label="ID do feed">
            <NodeInput value={p.id ?? 'mobs'} onChange={v => setParam('id', v)} placeholder="mobs" />
          </NodeField>
        </>
      )}
      {op === 'start' && (
        <>
          <NodeField label="Prefabs (lista)">
            <NodeInput value={p.prefabs ?? ''} onChange={v => setParam('prefabs', v)} placeholder="spider, hound, deerclops" />
          </NodeField>
          <NodeField label="Tags (qualquer uma)">
            <NodeInput value={p.tags ?? ''} onChange={v => setParam('tags', v)} placeholder="monster, hostile" />
          </NodeField>
          <NodeField label="Campos (hp, hunger, temperature, fuel, burning, comp.campo)">
            <NodeInput value={p.fields ?? 'hp, hp_max'} onChange={v => setParam('fields', v)} placeholder="hp, hp_max, temperature" />
          </NodeField>
          <NodeField label="Raio">
            <NodeInput value={p.radius ?? '30'} onChange={v => setParam('radius', v)} placeholder="30" />
          </NodeField>
          <NodeField label="Intervalo (s)">
            <NodeInput value={p.interval ?? '0.5'} onChange={v => setParam('interval', v)} placeholder="0.5" />
          </NodeField>
          <NodeField label="Máx. entidades">
            <NodeInput value={p.max ?? '30'} onChange={v => setParam('max', v)} placeholder="30" />
          </NodeField>
        </>
      )}
    </BaseNode>
  )
}
