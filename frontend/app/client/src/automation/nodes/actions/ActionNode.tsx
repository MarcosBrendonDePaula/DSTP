import { useCallback, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '../BaseNode'

export const ACTION_TYPES = [
  { value: 'announce', label: '📢 Announce', params: [{ key: 'message', label: 'Mensagem', placeholder: 'Texto do anúncio' }] },
  { value: 'chat_send', label: '💬 Chat Send', params: [{ key: 'message', label: 'Mensagem' }, { key: 'name', label: 'Nome', placeholder: '[DSTP]' }] },
  { value: 'heal', label: '❤ Heal', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }, { key: 'amount', label: 'Quantidade', placeholder: 'max' }] },
  { value: 'feed', label: '🍖 Feed', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }, { key: 'amount', label: 'Quantidade', placeholder: 'max' }] },
  { value: 'restore_sanity', label: '🧠 Restore Sanity', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }] },
  { value: 'give_item', label: '🎁 Give Item', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'log' }, { key: 'count', label: 'Qtd', placeholder: '1' }] },
  { value: 'kick', label: '🚫 Kick', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }] },
  { value: 'kill', label: '💀 Kill', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }] },
  { value: 'respawn', label: '✨ Respawn', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }] },
  { value: 'godmode', label: '🛡 Godmode', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }, { key: 'enabled', label: 'Ativar', placeholder: 'true' }] },
  { value: 'teleport', label: '📍 Teleport (coords)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{userid}}' }, { key: 'x', label: 'X' }, { key: 'z', label: 'Z' }] },
  { value: 'teleport_to_player', label: '📍 Teleport to Player', params: [{ key: 'userid', label: 'Quem TP', placeholder: '{{trigger.userid}}' }, { key: 'target_userid', label: 'Destino', placeholder: '{{resolver.target_userid}}' }] },
  { value: 'set_season', label: '🍂 Set Season', params: [{ key: 'season', label: 'Estação', placeholder: 'autumn' }] },
  { value: 'set_phase', label: '🌙 Set Phase', params: [{ key: 'phase', label: 'Fase', placeholder: 'day' }] },
  { value: 'skip_day', label: '⏭ Skip Days', params: [{ key: 'days', label: 'Dias', placeholder: '1' }] },
  { value: 'set_rain', label: '🌧 Set Rain', params: [{ key: 'enabled', label: 'Ativar', placeholder: 'true' }] },
  { value: 'stop_rain', label: '☀ Stop Rain', params: [] },
  { value: 'pause', label: '⏸ Pause', params: [] },
  { value: 'unpause', label: '▶ Unpause', params: [] },
  { value: 'set_speed', label: '⏩ Set Speed', params: [{ key: 'speed', label: 'Velocidade', placeholder: '1' }] },
  { value: 'rollback', label: '↩ Rollback', params: [{ key: 'days', label: 'Dias', placeholder: '0' }] },
  { value: 'execute', label: '🔧 Execute Lua', params: [{ key: 'lua', label: 'Código Lua', placeholder: 'print("hello")' }] },
]

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

  return (
    <BaseNode type="action" icon="🎯" label="Ação" selected={selected} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
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
          💡 Use {'{{campo}}'} para dados do evento
        </div>
      )}
    </BaseNode>
  )
}
