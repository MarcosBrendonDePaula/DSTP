import { useCallback } from 'react'
import { BaseNode, NodeField, NodeInput, useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function CallComponentNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  const setParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="⚙" label="Call Component" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Player">
        <NodeInput value={data.params?.userid ?? '{{trigger.userid}}'} onChange={v => setParam('userid', v)} placeholder="{{trigger.userid}}" />
      </NodeField>
      <NodeField label="Componente">
        <NodeInput value={data.params?.component || ''} onChange={v => setParam('component', v)} placeholder="locomotor" />
      </NodeField>
      <NodeField label="Método">
        <NodeInput value={data.params?.method || ''} onChange={v => setParam('method', v)} placeholder="SetExternalSpeedMultiplier" />
      </NodeField>
      <NodeField label="Args (JSON)">
        <NodeInput value={data.params?.args ?? '[]'} onChange={v => setParam('args', v)} placeholder='["{{self}}","dstp",2]' />
      </NodeField>
      <div className="text-[8px] text-gray-500 mt-1 space-y-0.5">
        <div>⚠ Poder total (admin). Gateie com condition {'{{'}player.admin{'}}'}==true.</div>
        <div>Use <code className="text-red-400">"{'{{'}self{'}}'}"</code> nos args p/ o próprio player.</div>
      </div>
    </BaseNode>
  )
}
