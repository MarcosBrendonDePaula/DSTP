import { BaseNode } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

export const ui = function TryCatchNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  return (
    <BaseNode
      type="condition"
      icon="🛡️"
      label="Try / Catch"
      selected={selected}
      executionStatus={data._executionStatus}
      executionOutput={data._executionOutput}
      executionError={data._executionError}
      hasCaptureData={data._hasCaptureData}
      alias={data.alias}
      onAliasChange={v => updateNodeData(id, { ...data, alias: v })}
      outputLabels={[
        { id: 'try', label: '🛡️ try' },
        { id: 'catch', label: '⚠️ catch' },
      ]}
    >
      <div className="text-[8px] text-gray-500 mt-1 space-y-0.5">
        <div>Ligue o que pode falhar no <span className="text-orange-400">try</span>; a recuperação, no <span className="text-amber-400">catch</span>.</div>
        <div>Erro disponível em <code className="text-orange-400">{'{{'}node.error{'}}'}</code></div>
      </div>
    </BaseNode>
  )
}
