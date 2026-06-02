import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '../BaseNode'
import { ACTION_TYPES } from './actionTypes'

// Re-exported so existing imports (`import { ACTION_TYPES } from '../nodes'`)
// keep working after the catalog moved to actionTypes.ts.
export { ACTION_TYPES } from './actionTypes'

export function ActionNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

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
