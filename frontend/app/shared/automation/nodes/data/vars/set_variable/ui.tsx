import { useCallback, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeInput } from '@client/src/automation/nodes/BaseNode'

export const ui = function SetVariableNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  const [newKey, setNewKey] = useState('')

  const params = data.params || {}

  const updateParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, action_type: 'set_variable', params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  const removeParam = useCallback((key: string) => {
    const newParams = { ...data.params }
    delete newParams[key]
    updateNodeData(id, { ...data, action_type: 'set_variable', params: newParams })
  }, [id, data, updateNodeData])

  const addParam = () => {
    if (newKey.trim()) {
      updateParam(newKey.trim(), '')
      setNewKey('')
    }
  }

  return (
    <BaseNode type="action" icon="📝" label="Set Variable" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      {Object.entries(params).map(([key, val]) => (
        <div key={key} className="flex gap-1 items-center">
          <span className="text-[9px] text-purple-400 min-w-[40px]">{key}</span>
          <NodeInput
            value={val as string}
            onChange={v => updateParam(key, v)}
            placeholder="valor ou {{ref}}"
          />
          <button
            onClick={() => removeParam(key)}
            className="text-[9px] text-red-500 hover:text-red-400 px-1"
          >✕</button>
        </div>
      ))}
      <div className="flex gap-1 mt-1">
        <NodeInput
          value={newKey}
          onChange={setNewKey}
          placeholder="nome da variável"
        />
        <button
          onClick={addParam}
          className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 shrink-0"
        >+ Add</button>
      </div>
      <div className="text-[8px] text-gray-500 mt-1">
        Output: <code className="text-purple-400">{'{{'}node_id.nome_var{'}}'}</code>
      </div>
    </BaseNode>
  )
}
