import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const METHODS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
]

export const ui = function HttpRequestNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const updateParam = useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, action_type: 'http_request', params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])

  return (
    <BaseNode type="action" icon="🌐" label="HTTP Request" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="URL">
        <NodeInput
          value={data.params?.url || ''}
          onChange={v => updateParam('url', v)}
          placeholder="https://api.example.com/webhook"
        />
      </NodeField>
      <NodeField label="Método">
        <NodeSelect
          value={data.params?.method || 'GET'}
          onChange={v => updateParam('method', v)}
          options={METHODS}
        />
      </NodeField>
      <NodeField label="Headers (JSON)">
        <NodeInput
          value={data.params?.headers || ''}
          onChange={v => updateParam('headers', v)}
          placeholder='{"Authorization": "Bearer ..."}'
        />
      </NodeField>
      {(data.params?.method || 'GET') !== 'GET' && (
        <NodeField label="Body">
          <NodeInput
            value={data.params?.body || ''}
            onChange={v => updateParam('body', v)}
            placeholder='{"text": "{{trigger.name}} morreu!"}'
          />
        </NodeField>
      )}
      <div className="text-[8px] text-gray-500 mt-1 space-y-0.5">
        <div>Output: <code className="text-blue-400">{'{{'}node_id.body{'}}'},  {'{{'}node_id.status{'}}'}</code></div>
        <div>Use <code className="text-purple-400">{'{{'}trigger.campo{'}}'}</code> nos campos</div>
      </div>
    </BaseNode>
  )
}
