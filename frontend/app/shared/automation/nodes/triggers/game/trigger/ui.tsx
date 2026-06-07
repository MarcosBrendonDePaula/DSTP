import { useCallback } from 'react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '@client/src/automation/nodes/BaseNode'
import { useNodeDataUpdater } from '@client/src/automation/nodes/BaseNode'

const COMBO_MODES = [
  { value: 'simultaneous', label: 'Simultânea (Ctrl+H)' },
  { value: 'sequence', label: 'Sequência (H, J, K)' },
  { value: 'any', label: 'Qualquer uma da lista' },
]

export const TRIGGER_EVENTS = [
  // Players
  { value: 'player_spawn', label: '👤 Player Join', category: 'players' },
  { value: 'player_left', label: '👤 Player Leave', category: 'players' },
  { value: 'player_death', label: '💀 Player Death', category: 'players' },
  { value: 'player_ghost', label: '👻 Player Ghost', category: 'players' },
  { value: 'player_respawn', label: '✨ Player Respawn', category: 'players' },
  { value: 'player_disconnected', label: '🔌 Player Disconnected', category: 'players' },
  { value: 'player_new_character', label: '🆕 Novo Personagem (1º spawn)', category: 'players' },
  { value: 'player_resurrected', label: '⛧ Player Ressuscitado', category: 'players' },
  { value: 'player_migrated', label: '🚇 Player Migrou (caves↔surface)', category: 'players' },
  // Griefing (anti-grief detection)
  { value: 'structure_burnt', label: '🔥 Structure Burnt', category: 'griefing' },
  { value: 'structure_hammered', label: '🔨 Structure Hammered', category: 'griefing' },
  { value: 'container_opened', label: '📦 Container Opened', category: 'griefing' },
  { value: 'container_closed', label: '📦 Container Closed', category: 'griefing' },
  { value: 'structure_worked', label: '🔨 Estrutura Destruída (quem)', category: 'griefing' },
  { value: 'object_ignited', label: '🔥 Objeto Incendiado (arsonista)', category: 'griefing' },
  { value: 'container_opened_entity', label: '📦 Baú Aberto (qual baú)', category: 'griefing' },
  { value: 'container_item_added', label: '📥 Item Depositado no Baú', category: 'griefing' },
  { value: 'container_item_taken', label: '📤 Item Retirado do Baú', category: 'griefing' },
  // Chat
  { value: 'chat_message', label: '💬 Chat Message', category: 'chat' },
  { value: 'command', label: '⌨ Comando (!cmd) — suprime do chat', category: 'chat' },
  // Combat
  { value: 'player_kill', label: '⚔ Player Kill', category: 'combat' },
  { value: 'player_attacked', label: '🛡 Player Attacked', category: 'combat' },
  { value: 'player_attack_other', label: '⚔ Player Atacou Alguém', category: 'combat' },
  { value: 'player_hit_other', label: '🩸 Player Acertou Alguém', category: 'combat' },
  { value: 'player_block', label: '🛡 Player Bloqueou (armadura)', category: 'combat' },
  { value: 'player_attack_miss', label: '💨 Player Errou o Golpe', category: 'combat' },
  { value: 'player_min_health', label: '💔 Player Quase Morreu (buff)', category: 'combat' },
  { value: 'player_combat_target', label: '🎯 Mob Mirou um Player (aggro)', category: 'combat' },
  // Crafting
  { value: 'player_craft', label: '🔨 Player Craft', category: 'crafting' },
  { value: 'player_build', label: '🏗 Player Build', category: 'crafting' },
  { value: 'recipe_unlocked', label: '🔓 Receita Desbloqueada', category: 'crafting' },
  { value: 'tech_tree_changed', label: '🔬 Tech Tree Mudou (prototipador)', category: 'crafting' },
  { value: 'structure_built', label: '🏠 Estrutura Construída (colocada)', category: 'crafting' },
  // Inventory
  { value: 'player_equip', label: '🎒 Player Equip', category: 'inventory' },
  { value: 'player_pickup', label: '📦 Player Pickup', category: 'inventory' },
  { value: 'player_drop', label: '📦 Player Drop', category: 'inventory' },
  { value: 'player_unequip', label: '🎒 Player Unequip', category: 'inventory' },
  { value: 'player_item_get', label: '📥 Player Recebeu Item', category: 'inventory' },
  { value: 'inventory_full', label: '🚫 Inventário Cheio', category: 'inventory' },
  { value: 'trade_received', label: '🤝 NPC Recebeu Troca (deu item)', category: 'inventory' },
  // Health
  { value: 'health_delta', label: '❤ Health Change', category: 'health' },
  { value: 'hunger_delta', label: '🍖 Hunger Change', category: 'health' },
  { value: 'sanity_delta', label: '🧠 Sanity Change', category: 'health' },
  // Gathering
  { value: 'player_work', label: '⛏ Player Work (chop/mine/hammer)', category: 'gathering' },
  { value: 'resource_gathered', label: '📦 Resource Gathered (loot drop)', category: 'gathering' },
  { value: 'player_harvest', label: '🌿 Player Harvest', category: 'gathering' },
  { value: 'player_startfire', label: '🔥 Player Start Fire', category: 'gathering' },
  { value: 'player_pick', label: '🌸 Player Colheu (do chão)', category: 'gathering' },
  { value: 'player_mine_chop_start', label: '⛏ Começou a Minerar/Cortar', category: 'gathering' },
  // World
  { value: 'new_day', label: '🌅 New Day', category: 'world' },
  { value: 'phase_changed', label: '🌙 Phase Changed', category: 'world' },
  { value: 'season_changed', label: '🍂 Season Changed', category: 'world' },
  { value: 'moon_phase_changed', label: '🌙 Moon Phase', category: 'world' },
  { value: 'earthquake', label: '🌍 Earthquake', category: 'world' },
  { value: 'sinkhole_warn', label: '🕳 Sinkhole Warning', category: 'world' },
  { value: 'world_save', label: '💾 World Save', category: 'world' },
  { value: 'rift_spawned', label: '🌑 Rift Aberto (lunar/sombrio)', category: 'world' },
  { value: 'rift_closed', label: '🌑 Rift Fechado', category: 'world' },
  { value: 'nightmare_phase', label: '😈 Ciclo do Pesadelo (ruínas)', category: 'world' },
  { value: 'item_planted', label: '🌱 Item Plantado/Colocado', category: 'world' },
  { value: 'object_activated', label: '🗿 Objeto Ativado (estação...)', category: 'world' },
  { value: 'machine_toggled', label: '⚙ Máquina Lig/Desl (flingomatic...)', category: 'world' },
  { value: 'tick', label: '⏲ Tick (heartbeat ~1s)', category: 'world' },
  { value: 'player_teleported', label: '🌀 Player Teleported', category: 'world' },
  // Weather
  { value: 'storm_changed', label: '⛈ Storm Changed', category: 'weather' },
  { value: 'precipitation', label: '🌧 Precipitation', category: 'weather' },
  { value: 'lightning_strike', label: '⚡ Lightning Strike', category: 'weather' },
  // Bosses
  { value: 'boss_event', label: '🐉 Boss Event', category: 'bosses' },
  { value: 'boss_killed', label: '🐉 Boss Killed', category: 'bosses' },
  { value: 'hound_warning', label: '🐺 Hound Warning', category: 'bosses' },
  { value: 'boss_warning', label: '😱 Boss Perto (rugido)', category: 'bosses' },
  { value: 'toadstool_state_changed', label: '🍄 Toadstool Mudou de Estado', category: 'bosses' },
  // Creatures (non-player mobs)
  { value: 'beefalo_tamed', label: '🐂 Beefalo Domesticado', category: 'creatures' },
  { value: 'beefalo_feral', label: '🐂 Beefalo Voltou a Selvagem', category: 'creatures' },
  { value: 'mob_transform', label: '🐺 Mob Transformou (were)', category: 'creatures' },
  { value: 'mob_frozen', label: '🧊 Mob Congelado', category: 'creatures' },
  { value: 'resource_picked', label: '🌸 Recurso Colhido (a planta)', category: 'creatures' },
  { value: 'mount_rider_changed', label: '🐂 Montaria Montada/Desmontada', category: 'creatures' },
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
  { value: 'player_enlightened', label: '🌕 Player Iluminado (lunacy)', category: 'survival' },
  { value: 'player_lunacy_normal', label: '🌑 Player Saiu da Lunacy', category: 'survival' },
  { value: 'player_wet', label: '💦 Player Molhado/Secou', category: 'survival' },
  // UI
  { value: 'ui_callback', label: '🖱 UI Callback (button click)', category: 'ui' },
  // Economy / inventory results (emitted back by inventory commands)
  { value: 'item_removed', label: '🗑 Item Removido (venda)', category: 'economy' },
  { value: 'item_count', label: '🔢 Contagem de Item', category: 'economy' },
  { value: 'item_has', label: '❓ Tem Item (resultado)', category: 'economy' },
  { value: 'item_transferred', label: '🔄 Item Transferido', category: 'economy' },
  { value: 'inventory_dump', label: '📋 Inventário Listado', category: 'economy' },
  { value: 'claim_list_result', label: '🛡 Claims Listadas (resultado)', category: 'economy' },
  { value: 'claim_check_result', label: '🛡 Claim Consultada (resultado)', category: 'economy' },
  { value: 'spawn_result', label: '🏗 Spawn Resultado (GUID)', category: 'economy' },
  { value: 'entity_data', label: '🔎 Entidade Lida (resultado)', category: 'economy' },
  // Character
  { value: 'recipe_learned', label: '📖 Recipe Learned', category: 'character' },
  { value: 'character_transform', label: '🐻 Character Transform', category: 'character' },
  { value: 'player_sleep_start', label: '😴 Sleep Start', category: 'character' },
  { value: 'player_sleep_end', label: '☀ Sleep End', category: 'character' },
  // Exploration
  { value: 'player_sunk', label: '🌊 Player Sunk', category: 'exploration' },
  { value: 'fish_caught', label: '🐟 Fish Caught', category: 'exploration' },
  // Input — NOT a DST event category. Key presses ride a separate watch_keys
  // channel: the backend tells the client which keys to watch (set the key below).
  { value: 'key_pressed', label: '⌨ Tecla Pressionada', category: 'input' },
  { value: 'key_combo', label: '⌨ Combo de Teclas', category: 'input' },
]

// Modifier keys for the simultaneous combo mode (queried via IsKeyDown, not watched).
export const COMBO_MODIFIERS = ['CTRL', 'SHIFT', 'ALT']

// Keys offerable to the key_pressed trigger. Must match what the mod's keys.lua can
// map to a DST KEY_* constant. Strings are what travel on the wire (uppercase).
export const WATCHABLE_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(k => ({ value: k, label: k })),
  ...Array.from({ length: 12 }, (_, i) => ({ value: `F${i + 1}`, label: `F${i + 1}` })),
  ...'0123456789'.split('').map(k => ({ value: k, label: k })),
  { value: 'SPACE', label: 'Espaço' },
  { value: 'TAB', label: 'Tab' },
  { value: 'UP', label: '↑ Cima' },
  { value: 'DOWN', label: '↓ Baixo' },
  { value: 'LEFT', label: '← Esquerda' },
  { value: 'RIGHT', label: '→ Direita' },
]

export const ui = function TriggerNode({ id, data, selected }: any) {
  const updateNodeData = useNodeDataUpdater()

  const onChange = useCallback((event_type: string) => {
    updateNodeData(id, { ...data, event_type })
  }, [id, data, updateNodeData])

  const selectedEvent = TRIGGER_EVENTS.find(e => e.value === data.event_type)

  const nodeLabel = selectedEvent?.label || 'Trigger'

  return (
    <BaseNode type="trigger" icon="⚡" label={nodeLabel} selected={selected} hasInput={false} executionStatus={data._executionStatus} executionOutput={data._executionOutput} executionError={data._executionError} hasCaptureData={data._hasCaptureData} alias={data.alias} onAliasChange={v => updateNodeData(id, { ...data, alias: v })}>
      <NodeField label="Quando acontecer">
        <NodeSelect
          value={data.event_type || ''}
          onChange={onChange}
          options={TRIGGER_EVENTS}
        />
      </NodeField>
      {data.event_type === 'key_pressed' && (
        <NodeField label="Tecla">
          <NodeSelect
            value={data.params?.key || ''}
            onChange={(key: string) => updateNodeData(id, { ...data, params: { ...(data.params || {}), key } })}
            options={WATCHABLE_KEYS}
          />
        </NodeField>
      )}
      {data.event_type === 'key_combo' && (() => {
        const p = data.params || {}
        const mode = p.mode || 'simultaneous'
        const setP = (patch: any) => updateNodeData(id, { ...data, params: { ...p, ...patch } })
        const mods: string[] = Array.isArray(p.modifiers) ? p.modifiers : []
        const toggleMod = (m: string) => setP({ modifiers: mods.includes(m) ? mods.filter(x => x !== m) : [...mods, m] })
        return (
          <>
            <NodeField label="Modo">
              <NodeSelect value={mode} onChange={(v: string) => setP({ mode: v })} options={COMBO_MODES} />
            </NodeField>
            {mode === 'simultaneous' && (
              <>
                <NodeField label="Tecla principal">
                  <NodeSelect value={p.key || ''} onChange={(v: string) => setP({ key: v })} options={WATCHABLE_KEYS} />
                </NodeField>
                <NodeField label="Modificadores">
                  <div className="flex gap-2">
                    {COMBO_MODIFIERS.map(m => (
                      <label key={m} className="flex items-center gap-1 text-[9px] text-gray-400 cursor-pointer">
                        <input type="checkbox" checked={mods.includes(m)} onChange={() => toggleMod(m)} />
                        {m}
                      </label>
                    ))}
                  </div>
                </NodeField>
              </>
            )}
            {mode === 'sequence' && (
              <>
                <NodeField label="Sequência (vírgula)">
                  <NodeInput value={p.keys || ''} onChange={(v: string) => setP({ keys: v })} placeholder="H, J, K" />
                </NodeField>
                <NodeField label="Tempo limite (ms)">
                  <NodeInput value={p.timeoutMs || ''} onChange={(v: string) => setP({ timeoutMs: v })} placeholder="1000" />
                </NodeField>
              </>
            )}
            {mode === 'any' && (
              <NodeField label="Teclas (vírgula)">
                <NodeInput value={p.keys || ''} onChange={(v: string) => setP({ keys: v })} placeholder="F1, F2, F3" />
              </NodeField>
            )}
          </>
        )
      })()}
      {selectedEvent && (
        <div className="text-[9px] text-gray-500 mt-1">
          Categoria: {selectedEvent.category}
        </div>
      )}
    </BaseNode>
  )
}
