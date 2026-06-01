import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect } from '../BaseNode'

export const TRIGGER_EVENTS = [
  // Players
  { value: 'player_spawn', label: '👤 Player Join', category: 'players' },
  { value: 'player_left', label: '👤 Player Leave', category: 'players' },
  { value: 'player_death', label: '💀 Player Death', category: 'players' },
  { value: 'player_ghost', label: '👻 Player Ghost', category: 'players' },
  { value: 'player_respawn', label: '✨ Player Respawn', category: 'players' },
  { value: 'player_disconnected', label: '🔌 Player Disconnected', category: 'players' },
  // Griefing (anti-grief detection)
  { value: 'structure_burnt', label: '🔥 Structure Burnt', category: 'griefing' },
  { value: 'structure_hammered', label: '🔨 Structure Hammered', category: 'griefing' },
  { value: 'container_opened', label: '📦 Container Opened', category: 'griefing' },
  { value: 'container_closed', label: '📦 Container Closed', category: 'griefing' },
  // Chat
  { value: 'chat_message', label: '💬 Chat Message', category: 'chat' },
  // Combat
  { value: 'player_kill', label: '⚔ Player Kill', category: 'combat' },
  { value: 'player_attacked', label: '🛡 Player Attacked', category: 'combat' },
  { value: 'player_attack_other', label: '⚔ Player Atacou Alguém', category: 'combat' },
  { value: 'player_hit_other', label: '🩸 Player Acertou Alguém', category: 'combat' },
  // Crafting
  { value: 'player_craft', label: '🔨 Player Craft', category: 'crafting' },
  { value: 'player_build', label: '🏗 Player Build', category: 'crafting' },
  // Inventory
  { value: 'player_equip', label: '🎒 Player Equip', category: 'inventory' },
  { value: 'player_pickup', label: '📦 Player Pickup', category: 'inventory' },
  { value: 'player_drop', label: '📦 Player Drop', category: 'inventory' },
  { value: 'player_unequip', label: '🎒 Player Unequip', category: 'inventory' },
  { value: 'player_item_get', label: '📥 Player Recebeu Item', category: 'inventory' },
  // Health
  { value: 'health_delta', label: '❤ Health Change', category: 'health' },
  { value: 'hunger_delta', label: '🍖 Hunger Change', category: 'health' },
  { value: 'sanity_delta', label: '🧠 Sanity Change', category: 'health' },
  // Gathering
  { value: 'player_work', label: '⛏ Player Work (chop/mine/hammer)', category: 'gathering' },
  { value: 'resource_gathered', label: '📦 Resource Gathered (loot drop)', category: 'gathering' },
  { value: 'player_harvest', label: '🌿 Player Harvest', category: 'gathering' },
  { value: 'player_startfire', label: '🔥 Player Start Fire', category: 'gathering' },
  // World
  { value: 'new_day', label: '🌅 New Day', category: 'world' },
  { value: 'phase_changed', label: '🌙 Phase Changed', category: 'world' },
  { value: 'season_changed', label: '🍂 Season Changed', category: 'world' },
  { value: 'moon_phase_changed', label: '🌙 Moon Phase', category: 'world' },
  { value: 'earthquake', label: '🌍 Earthquake', category: 'world' },
  { value: 'sinkhole_warn', label: '🕳 Sinkhole Warning', category: 'world' },
  { value: 'world_save', label: '💾 World Save', category: 'world' },
  { value: 'tick', label: '⏲ Tick (heartbeat ~1s)', category: 'world' },
  { value: 'player_teleported', label: '🌀 Player Teleported', category: 'world' },
  // Weather
  { value: 'storm_changed', label: '⛈ Storm Changed', category: 'weather' },
  { value: 'precipitation', label: '🌧 Precipitation', category: 'weather' },
  { value: 'lightning_strike', label: '⚡ Lightning Strike', category: 'weather' },
  // Bosses
  { value: 'boss_event', label: '🐉 Boss Event', category: 'bosses' },
  { value: 'boss_killed', label: '🐉 Boss Killed', category: 'bosses' },
  { value: 'fire_started', label: '🔥 Fire Started', category: 'bosses' },
  { value: 'hound_warning', label: '🐺 Hound Warning', category: 'bosses' },
  { value: 'hound_attack', label: '🐺 Hound Attack', category: 'bosses' },
  // Survival
  { value: 'player_eat', label: '🍽 Player Eat', category: 'survival' },
  { value: 'player_insane', label: '😵 Player Insane', category: 'survival' },
  { value: 'player_sane', label: '😌 Player Sane', category: 'survival' },
  { value: 'player_starving', label: '😫 Player Starving', category: 'survival' },
  { value: 'player_fed', label: '😊 Player Fed', category: 'survival' },
  { value: 'player_freezing', label: '🥶 Player Freezing', category: 'survival' },
  { value: 'player_warm', label: '🔥 Player Warm', category: 'survival' },
  { value: 'player_overheating', label: '🥵 Player Overheating', category: 'survival' },
  { value: 'player_cooled', label: '❄ Player Cooled', category: 'survival' },
  { value: 'player_mounted', label: '🐂 Player Mounted', category: 'survival' },
  { value: 'player_dismounted', label: '🐂 Player Dismounted', category: 'survival' },
  { value: 'player_on_fire', label: '🔥 Player Pegando Fogo', category: 'survival' },
  { value: 'player_fire_out', label: '💧 Player Apagou o Fogo', category: 'survival' },
  // UI
  { value: 'ui_callback', label: '🖱 UI Callback (button click)', category: 'ui' },
  // Economy / inventory results (emitted back by inventory commands)
  { value: 'item_removed', label: '🗑 Item Removido (venda)', category: 'economy' },
  { value: 'item_count', label: '🔢 Contagem de Item', category: 'economy' },
  { value: 'item_has', label: '❓ Tem Item (resultado)', category: 'economy' },
  { value: 'item_transferred', label: '🔄 Item Transferido', category: 'economy' },
  { value: 'inventory_dump', label: '📋 Inventário Listado', category: 'economy' },
  // Character
  { value: 'recipe_learned', label: '📖 Recipe Learned', category: 'character' },
  { value: 'book_read', label: '📚 Book Read', category: 'character' },
  { value: 'character_transform', label: '🐻 Character Transform', category: 'character' },
  { value: 'player_sleep_start', label: '😴 Sleep Start', category: 'character' },
  { value: 'player_sleep_end', label: '☀ Sleep End', category: 'character' },
  // Exploration
  { value: 'player_sunk', label: '🌊 Player Sunk', category: 'exploration' },
  { value: 'fish_caught', label: '🐟 Fish Caught', category: 'exploration' },
  { value: 'boat_entered', label: '⛵ Boat Entered', category: 'exploration' },
  { value: 'boat_exited', label: '⛵ Boat Exited', category: 'exploration' },
]

export function TriggerNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const onChange = useCallback((event_type: string) => {
    updateNodeData(id, { ...data, event_type })
  }, [id, data, updateNodeData])

  const selectedEvent = TRIGGER_EVENTS.find(e => e.value === data.event_type)

  return (
    <BaseNode type="trigger" icon="⚡" label="Trigger" selected={selected} hasInput={false} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Quando acontecer">
        <NodeSelect
          value={data.event_type || ''}
          onChange={onChange}
          options={TRIGGER_EVENTS}
        />
      </NodeField>
      {selectedEvent && (
        <div className="text-[9px] text-gray-500 mt-1">
          Categoria: {selectedEvent.category}
        </div>
      )}
    </BaseNode>
  )
}
