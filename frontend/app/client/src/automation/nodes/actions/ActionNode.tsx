import { useCallback, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '../BaseNode'

export const ACTION_TYPES = [
  { value: 'announce', label: '📢 Announce', params: [{ key: 'message', label: 'Mensagem', placeholder: 'Texto do anúncio' }] },
  { value: 'private_message', label: '💬 Sussurro', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'message', label: 'Mensagem', placeholder: 'Mensagem privada' }] },
  { value: 'chat_send', label: '💬 Chat Send', params: [{ key: 'message', label: 'Mensagem' }, { key: 'name', label: 'Nome', placeholder: '[DSTP]' }] },
  { value: 'heal', label: '❤ Heal', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'amount', label: 'Quantidade', placeholder: 'max' }] },
  { value: 'feed', label: '🍖 Feed', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'amount', label: 'Quantidade', placeholder: 'max' }] },
  { value: 'restore_sanity', label: '🧠 Restore Sanity', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }] },
  { value: 'give_item', label: '🎁 Give Item', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'log' }, { key: 'count', label: 'Qtd', placeholder: '1' }] },
  { value: 'kick', label: '🚫 Kick', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }] },
  { value: 'kill', label: '💀 Kill', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }] },
  { value: 'respawn', label: '✨ Respawn', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }] },
  { value: 'godmode', label: '🛡 Godmode', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'enabled', label: 'Ativar', placeholder: 'true' }] },
  { value: 'teleport', label: '📍 Teleport (coords)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'x', label: 'X' }, { key: 'z', label: 'Z' }] },
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
  // Admin / World control
  { value: 'ban', label: '🔨 Ban', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }] },
  { value: 'lightning', label: '⚡ Lightning no Player', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }] },
  { value: 'regenerate', label: '🌍 Regenerate World', params: [] },
  { value: 'set_next_phase', label: '⏭ Próxima Fase', params: [] },
  { value: 'set_snow', label: '❄ Set Snow', params: [{ key: 'enabled', label: 'Ativar', placeholder: 'true' }] },
  { value: 'set_day_length', label: '🕐 Duração do Ciclo', params: [{ key: 'day', label: 'Dia (segs)', placeholder: '10' }, { key: 'dusk', label: 'Anoitecer (segs)', placeholder: '4' }, { key: 'night', label: 'Noite (segs)', placeholder: '8' }] },
  { value: 'set_season_length', label: '🍂 Duração da Estação', params: [{ key: 'season', label: 'Estação', placeholder: 'autumn' }, { key: 'length', label: 'Dias', placeholder: '20' }] },
  { value: 'remove_inventory', label: '🗑 Remover Item (slot)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'slot', label: 'Slot', placeholder: '1' }] },
  // Spawn/Remove
  { value: 'spawn_at_player', label: '🏗 Spawn at Player', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'skeleton' }, { key: 'count', label: 'Qtd', placeholder: '1' }, { key: 'offset_x', label: 'Offset X', placeholder: '0' }, { key: 'offset_z', label: 'Offset Z', placeholder: '0' }] },
  { value: 'spawn_prefab', label: '🏗 Spawn (coords)', params: [{ key: 'prefab', label: 'Prefab', placeholder: 'skeleton' }, { key: 'x', label: 'X' }, { key: 'z', label: 'Z' }, { key: 'count', label: 'Qtd', placeholder: '1' }] },
  { value: 'remove_near_player', label: '🗑 Remove Near Player', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'skeleton' }, { key: 'radius', label: 'Raio', placeholder: '10' }, { key: 'limit', label: 'Limite', placeholder: '999' }] },
  { value: 'remove_near', label: '🗑 Remove Near (coords)', params: [{ key: 'prefab', label: 'Prefab' }, { key: 'x', label: 'X' }, { key: 'z', label: 'Z' }, { key: 'radius', label: 'Raio', placeholder: '10' }, { key: 'limit', label: 'Limite', placeholder: '999' }] },
  { value: 'destroy_structure', label: '🔨 Destroy Structure', params: [{ key: 'x', label: 'X' }, { key: 'z', label: 'Z' }, { key: 'prefab', label: 'Prefab (opcional)' }, { key: 'radius', label: 'Raio', placeholder: '3' }] },
  // UI Widgets
  { value: 'ui_notification', label: '🔔 Notificação', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'text', label: 'Texto', placeholder: 'Mensagem...' },
    { key: 'duration', label: 'Duração (s)', placeholder: '5' },
  ] },
  { value: 'ui_label', label: '🏷 Label HUD', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'ID', placeholder: 'meu_label' },
    { key: 'text', label: 'Texto', placeholder: 'Info...' },
    { key: 'x', label: 'X', placeholder: '0' },
    { key: 'y', label: 'Y', placeholder: '300' },
    { key: 'anchor', label: 'Ancora', placeholder: 'top' },
  ] },
  { value: 'ui_panel', label: '📋 Painel', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'ID', placeholder: 'meu_painel' },
    { key: 'title', label: 'Titulo', placeholder: 'Info' },
    { key: 'body', label: 'Conteudo', placeholder: 'Texto do painel...' },
    { key: 'width', label: 'Largura', placeholder: '400' },
    { key: 'height', label: 'Altura', placeholder: '300' },
  ] },
  { value: 'ui_progress_bar', label: '📊 Barra', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'ID', placeholder: 'minha_barra' },
    { key: 'value', label: 'Valor (0-1)', placeholder: '{{jogador.health.current}}' },
    { key: 'max', label: 'Max', placeholder: '{{jogador.health.max}}' },
    { key: 'label', label: 'Label', placeholder: 'HP' },
    { key: 'width', label: 'Largura', placeholder: '200' },
  ] },
  { value: 'ui_destroy', label: '❌ Remover Widget', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'Widget ID', placeholder: 'meu_label' },
  ] },
  { value: 'ui_clear', label: '🧹 Limpar Widgets', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
  ] },
  { value: 'rule_install', label: '⚙ Install Rule', params: [
    { key: 'userid', label: 'Player (vazio = todos)', placeholder: '{{trigger.userid}}' },
    { key: 'rules', label: 'Rules JSON', placeholder: '[{"id":"my_rule","when":{"event":"healthdelta"},"do":[...]}]' },
  ] },
  { value: 'rule_uninstall', label: '⚙ Uninstall Rule', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'ids', label: 'Rule IDs (vírgula)', placeholder: 'my_rule,another_rule' },
  ] },
  { value: 'rule_set_state', label: '⚙ Set Player State', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'key', label: 'Chave', placeholder: 'coins' },
    { key: 'value', label: 'Valor', placeholder: '100' },
  ] },
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
          💡 Use {'{{alias.campo}}'} ex: {'{{trigger.userid}}'}
        </div>
      )}
    </BaseNode>
  )
}
