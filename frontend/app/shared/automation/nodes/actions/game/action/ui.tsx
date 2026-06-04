import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'
import { ACTION_TYPES } from '@client/src/automation/nodes/actions/actionTypes'

export const ui = function ActionNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const updateAction = useCallback((action_type: string) => {
    const action = ACTION_TYPES.find(a => a.value === action_type)
    const params: Record<string, string> = {}
    if (action) {
      for (const p of action.params) {
        params[p.key] = p.placeholder || ''
      }
    }
    updateNodeData(id, { ...data, action_type, params })
  }, [id, data, updateNodeData])

  const updateParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const actionDef = ACTION_TYPES.find(a => a.value === data.action_type)
  const nodeLabel = actionDef?.label || 'Ação'

  return (
    <BaseNode type="action" icon="🎯" label={nodeLabel} selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Executar">
        <NodeSelect
          value={data.action_type || ''}
          onChange={updateAction}
          options={ACTION_TYPES.map(a => ({ value: a.value, label: a.label }))}
        />
      </NodeField>
      {actionDef && actionDef.params.map(p => (
        <NodeField key={p.key} label={p.label}>
          <NodeInput
            value={data.params?.[p.key] || ''}
            onChange={v => updateParam(p.key, v)}
            placeholder={p.placeholder}
          />
        </NodeField>
      ))}
      {actionDef && (
        <div className="text-[8px] text-gray-500 mt-1">
          💡 Use {'{{alias.campo}}'} ex: {'{{trigger.userid}}'}
        </div>
      )}
    </BaseNode>
  )
}
