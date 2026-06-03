import { useCallback, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '../BaseNode'

const METHODS = [
  { value: 'ANY', label: 'ANY (qualquer método)' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
]

// Entry point fired by an inbound HTTP request, not a game event. The request
// body/query/headers arrive in {{trigger.body}}, {{trigger.query}}, etc.
export function WebhookNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  const [copied, setCopied] = useState(false)

  const setParam = useCallback((key: string, val: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: val } })
  }, [id, data, updateNodeData])

  // serverId comes from the panel URL (?server=...); the node id is the webhook id.
  const url = useMemo(() => {
    const serverId = new URLSearchParams(window.location.search).get('server') || '<serverId>'
    return `${window.location.origin}/api/webhook/${serverId}/${id}`
  }, [id])

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [url])

  return (
    <BaseNode type="trigger" icon="🪝" label="Webhook" selected={selected} hasInput={false} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Método">
        <NodeSelect value={data.params?.method || 'ANY'} onChange={v => setParam('method', v)} options={METHODS} />
      </NodeField>
      <NodeField label="Token (opcional)">
        <NodeInput value={data.params?.token || ''} onChange={v => setParam('token', v)} placeholder="deixe vazio = aberto" />
      </NodeField>
      <div className="mt-1.5">
        <div className="text-[8px] text-gray-500 mb-0.5">URL (POST/GET aqui pra disparar):</div>
        <button
          onClick={copy}
          title={url}
          className="w-full text-left text-[8px] font-mono bg-black/30 border border-white/10 rounded px-1.5 py-1 text-emerald-300/80 truncate hover:border-emerald-500/40"
        >
          {copied ? '✓ copiado!' : url}
        </button>
        <div className="text-[8px] text-gray-500 mt-1">
          📦 {'{{trigger.body}}'}, {'{{trigger.query}}'}, {'{{trigger.headers}}'}
        </div>
      </div>
    </BaseNode>
  )
}
