// Shared UI for "dedicated action" nodes — a node whose action_type is FIXED (e.g.
// the Teleport node always dispatches the `teleport` command). Unlike the generic
// Action node, there's no action-type dropdown: the params for the fixed action are
// rendered directly. The exec is the generic action handler (it reads
// node.data.action_type, which the node's meta.defaults sets). This keeps a
// first-class palette node to ~one meta + one line of ui, with zero new Lua and zero
// new backend dispatch — it reuses the existing command + runFlowAction pipeline.
import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'
import { ACTION_TYPES } from '@client/src/automation/nodes/actions/actionTypes'

// Build a ui component bound to one action_type + icon/label.
export function makeFixedActionUi(actionType: string, icon: string, label: string) {
  return function FixedActionNode({ id, data, selected }: any) {
    const updateNodeData = useNodeDataUpdater()
    const updateParam = useCallback((key: string, value: string) => {
      updateNodeData(id, { ...data, action_type: actionType, params: { ...data.params, [key]: value } })
    }, [id, data, updateNodeData])

    const def = ACTION_TYPES.find(a => a.value === actionType)
    return (
      <BaseNode type="action" icon={icon} label={label} selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
        {(def?.params || []).map(p => (
          <NodeField key={p.key} label={p.label}>
            <NodeInput value={data.params?.[p.key] || ''} onChange={v => updateParam(p.key, v)} placeholder={p.placeholder} />
          </NodeField>
        ))}
        <div className="text-[8px] text-gray-500 mt-1">💡 {'{{trigger.userid}}'}, {'{{trigger.world_x}}'}...</div>
      </BaseNode>
    )
  }
}
