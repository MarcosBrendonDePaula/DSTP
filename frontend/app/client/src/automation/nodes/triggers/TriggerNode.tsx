import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect } from '../BaseNode'

export const TRIGGER_EVENTS = [
  { value: 'player_spawn', label: '👤 Player Join', category: 'players' },
  { value: 'player_left', label: '👤 Player Leave', category: 'players' },
  { value: 'player_death', label: '💀 Player Death', category: 'players' },
  { value: 'player_ghost', label: '👻 Player Ghost', category: 'players' },
  { value: 'player_respawn', label: '✨ Player Respawn', category: 'players' },
  { value: 'chat_message', label: '💬 Chat Message', category: 'chat' },
  { value: 'new_day', label: '🌅 New Day', category: 'world' },
  { value: 'phase_changed', label: '🌙 Phase Changed', category: 'world' },
  { value: 'season_changed', label: '🍂 Season Changed', category: 'world' },
  { value: 'player_kill', label: '⚔ Player Kill', category: 'combat' },
  { value: 'player_attacked', label: '🛡 Player Attacked', category: 'combat' },
  { value: 'player_craft', label: '🔨 Player Craft', category: 'crafting' },
  { value: 'player_build', label: '🏗 Player Build', category: 'crafting' },
  { value: 'player_equip', label: '🎒 Player Equip', category: 'inventory' },
  { value: 'player_pickup', label: '📦 Player Pickup', category: 'inventory' },
  { value: 'player_drop', label: '📦 Player Drop', category: 'inventory' },
  { value: 'storm_changed', label: '⛈ Storm Changed', category: 'weather' },
  { value: 'precipitation', label: '🌧 Precipitation', category: 'weather' },
  { value: 'boss_killed', label: '🐉 Boss Killed', category: 'bosses' },
  { value: 'health_delta', label: '❤ Health Change', category: 'health' },
  { value: 'hunger_delta', label: '🍖 Hunger Change', category: 'health' },
  { value: 'sanity_delta', label: '🧠 Sanity Change', category: 'health' },
]

export function TriggerNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const onChange = useCallback((event_type: string) => {
    updateNodeData(id, { ...data, event_type })
  }, [id, data, updateNodeData])

  const selectedEvent = TRIGGER_EVENTS.find(e => e.value === data.event_type)

  return (
    <BaseNode type="trigger" icon="⚡" label="Trigger" selected={selected} hasInput={false}>
      <NodeField label="Quando acontecer">
        <NodeSelect
          value={data.event_type || ''}
          onChange={onChange}
          options={TRIGGER_EVENTS}
        />
      </NodeField>
      {selectedEvent && (
        <div className="text-[9px] text-gray-600 mt-1">
          Categoria: {selectedEvent.category}
        </div>
      )}
    </BaseNode>
  )
}
