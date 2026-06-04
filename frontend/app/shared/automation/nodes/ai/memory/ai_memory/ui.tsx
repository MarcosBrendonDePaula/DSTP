import { BaseNode } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

// ai_memory — the AI's own key/value store, used as a TOOL. Connect its output to
// an ai_agent's `tools` handle. There's nothing to configure: the AI decides the
// operation (save/get/list/delete), the key (free-form, e.g. "player:joe:house"
// or "server:pvp") and the value at runtime.
export const ui = function AIMemoryNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()
  return (
    <BaseNode
      type="ai_agent"
      icon="🧠"
      label="AI Memory"
      selected={selected}
      executionStatus={data._executionStatus}
      executionOutput={data._executionOutput}
      executionError={data._executionError}
      hasCaptureData={data._hasCaptureData}
      alias={data.alias}
      onAliasChange={(v: string) => updateNodeData(id, { ...data, alias: v })}
    >
      <div className="text-[9px] text-gray-400 leading-relaxed">
        Ferramenta de memória da IA.<br />
        Conecte na porta <span className="text-fuchsia-400">tools</span> de um AI Agent.
      </div>
      <div className="text-[8px] text-gray-500 mt-1">
        A IA escolhe operação (save/get/list/delete) e a chave (ex: <span className="text-gray-400">player:joao:casa</span>).
      </div>
    </BaseNode>
  )
}
