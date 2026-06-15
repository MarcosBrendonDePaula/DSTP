// Catálogo de tipos de ação do Action node. Lista de dados (não componentes):
// cada entrada é { value, label, params:[{key,label,placeholder}] }. Extraído do
// ActionNode.tsx para manter o componente enxuto.

// ─── Subgrupos das ações (para o catálogo filtrável) ───
// As 65 ações são muitas para um único filtro "Ações". Cada uma pertence a um
// grupo semântico (Jogador, Inventário, Mundo, Entidades, Comunicação, UI, Regras,
// Admin). Mantido como mapa value→group (em vez de um campo por linha) para não
// inflar as 65 entradas e ter a taxonomia visível num lugar só. Também serve de
// dica de domínio para o ai_agent.
export interface ActionGroupMeta { id: string; label: string; icon: string }
export const ACTION_GROUPS: ActionGroupMeta[] = [
  { id: 'player', label: 'Jogador', icon: 'LuUser' },
  { id: 'inventory', label: 'Inventário', icon: 'LuBackpack' },
  { id: 'world', label: 'Mundo & Clima', icon: 'LuCloudSun' },
  { id: 'entity', label: 'Entidades & Spawn', icon: 'LuBox' },
  { id: 'communication', label: 'Comunicação', icon: 'LuMessageSquare' },
  { id: 'interface', label: 'Interface', icon: 'LuLayoutDashboard' },
  { id: 'rules', label: 'Regras / Cliente', icon: 'LuMonitor' },
  { id: 'admin', label: 'Admin / Poder', icon: 'LuShieldAlert' },
]

export const ACTION_GROUP_BY_VALUE: Record<string, string> = {
  announce: 'communication', private_message: 'communication', chat_send: 'communication',
  heal: 'player', feed: 'player', restore_sanity: 'player', kick: 'player', kill: 'player',
  respawn: 'player', godmode: 'player', teleport: 'player', teleport_to_player: 'player', lightning: 'player',
  give_item: 'inventory', remove_inventory: 'inventory', remove_item: 'inventory', count_item: 'inventory',
  has_item: 'inventory', equip_item: 'inventory', unequip: 'inventory', drop_item: 'inventory',
  clear_inventory: 'inventory', transfer_item: 'inventory', dump_inventory: 'inventory',
  set_season: 'world', set_phase: 'world', set_next_phase: 'world', skip_day: 'world', set_rain: 'world',
  stop_rain: 'world', set_snow: 'world', set_day_length: 'world', set_season_length: 'world',
  set_speed: 'world', pause: 'world', unpause: 'world',
  spawn_at_player: 'entity', spawn_prefab: 'entity', remove_near_player: 'entity', remove_near: 'entity',
  destroy_structure: 'entity', get_entity: 'entity', entity_set_health: 'entity', entity_kill: 'entity',
  kill_area: 'entity', entity_extinguish: 'entity', entity_ignite: 'entity', entity_set_fuel: 'entity',
  entity_freeze: 'entity', entity_unfreeze: 'entity',
  ui_track: 'interface', ui_notification: 'interface', ui_label: 'interface', ui_panel: 'interface',
  ui_progress_bar: 'interface', ui_set: 'interface', ui_destroy: 'interface', ui_clear: 'interface',
  rule_install: 'rules', rule_uninstall: 'rules', rule_set_state: 'rules',
  execute: 'admin', ban: 'admin', regenerate: 'admin', rollback: 'admin',
}

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
  { value: 'remove_item', label: '🗑 Remover Item (prefab, N)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'log' }, { key: 'count', label: 'Qtd', placeholder: '1' }, { key: 'token', label: 'Token (correlação)', placeholder: '{{trigger.callback}}' }] },
  { value: 'count_item', label: '🔢 Contar Item (prefab)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'log' }, { key: 'token', label: 'Token (correlação)', placeholder: '' }] },
  { value: 'has_item', label: '❓ Tem Item? (≥N)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'goldnugget' }, { key: 'count', label: 'Qtd mínima', placeholder: '1' }, { key: 'token', label: 'Token', placeholder: '' }] },
  { value: 'equip_item', label: '🎽 Equipar Item', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'spear' }] },
  { value: 'unequip', label: '🧤 Desequipar (slot)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'slot', label: 'Slot (hand/body/head)', placeholder: 'hand' }, { key: 'drop', label: 'Dropar? (true)', placeholder: '' }] },
  { value: 'drop_item', label: '📤 Dropar Item (prefab, N)', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'log' }, { key: 'count', label: 'Qtd', placeholder: '1' }] },
  { value: 'clear_inventory', label: '🧹 Limpar Inventário', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Só este prefab (vazio=tudo)', placeholder: '' }] },
  { value: 'transfer_item', label: '🔄 Transferir Item', params: [{ key: 'from_userid', label: 'De (User ID)', placeholder: '{{trigger.userid}}' }, { key: 'to_userid', label: 'Para (User ID)', placeholder: '{{alvo.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'log' }, { key: 'count', label: 'Qtd', placeholder: '1' }, { key: 'token', label: 'Token', placeholder: '' }] },
  { value: 'dump_inventory', label: '📋 Listar Inventário', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'token', label: 'Token', placeholder: '' }] },
  { value: 'ui_track', label: '🎯 HUD sobre Entidade', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'ID do widget', placeholder: 'boss_hp' },
    { key: 'prefab', label: 'Prefab alvo (vazio=mais próx.)', placeholder: 'deerclops' },
    { key: 'label', label: 'Texto', placeholder: 'Boss' },
    { key: 'max_dist', label: 'Distância máx.', placeholder: '40' },
    { key: 'offset_y', label: 'Offset Y (acima)', placeholder: '60' },
    { key: 'width', label: 'Largura', placeholder: '80' },
    { key: 'color', label: 'Cor [r,g,b,a]', placeholder: '[0.9,0.2,0.2,1]' },
  ] },
  // Spawn/Remove
  { value: 'spawn_at_player', label: '🏗 Spawn at Player', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'skeleton' }, { key: 'count', label: 'Qtd', placeholder: '1' }, { key: 'offset_x', label: 'Offset X', placeholder: '0' }, { key: 'offset_z', label: 'Offset Z', placeholder: '0' }] },
  { value: 'spawn_prefab', label: '🏗 Spawn (coords)', params: [{ key: 'prefab', label: 'Prefab', placeholder: 'skeleton' }, { key: 'x', label: 'X' }, { key: 'z', label: 'Z' }, { key: 'count', label: 'Qtd', placeholder: '1' }] },
  { value: 'remove_near_player', label: '🗑 Remove Near Player', params: [{ key: 'userid', label: 'User ID', placeholder: '{{trigger.userid}}' }, { key: 'prefab', label: 'Prefab', placeholder: 'skeleton' }, { key: 'radius', label: 'Raio', placeholder: '10' }, { key: 'limit', label: 'Limite', placeholder: '999' }] },
  { value: 'remove_near', label: '🗑 Remove Near (coords)', params: [{ key: 'prefab', label: 'Prefab' }, { key: 'x', label: 'X' }, { key: 'z', label: 'Z' }, { key: 'radius', label: 'Raio', placeholder: '10' }, { key: 'limit', label: 'Limite', placeholder: '999' }] },
  { value: 'destroy_structure', label: '🔨 Destroy Structure', params: [{ key: 'x', label: 'X' }, { key: 'z', label: 'Z' }, { key: 'prefab', label: 'Prefab (opcional)' }, { key: 'radius', label: 'Raio', placeholder: '3' }] },
  // Entity control (key por guid de um evento, OU prefab+x+z+radius). Token correlaciona o resultado.
  { value: 'get_entity', label: '🔎 Ler Entidade (por GUID)', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: 'beefalo' },
    { key: 'x', label: 'X', placeholder: '' },
    { key: 'z', label: 'Z', placeholder: '' },
    { key: 'radius', label: 'Raio', placeholder: '8' },
    { key: 'token', label: 'Token (correlação)', placeholder: '{{trigger.callback}}' },
  ] },
  { value: 'entity_set_health', label: '❤ Entidade: Set Health', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X', placeholder: '' }, { key: 'z', label: 'Z', placeholder: '' }, { key: 'radius', label: 'Raio', placeholder: '8' },
    { key: 'percent', label: '% (0-1) OU', placeholder: '1' },
    { key: 'amount', label: 'Delta (+/-)', placeholder: '' },
  ] },
  { value: 'entity_kill', label: '💀 Entidade: Matar (smite)', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X', placeholder: '' }, { key: 'z', label: 'Z', placeholder: '' }, { key: 'radius', label: 'Raio', placeholder: '8' },
  ] },
  // Mata em ÁREA em volta de um player. filter: mobs (criaturas, padrão) | hostile
  // (só quem agride) | prefab (só o prefab informado) | all (tudo com vida, exceto
  // players). Sempre poupa o próprio player. limit evita lag num raio grande.
  { value: 'kill_area', label: '☠ Matar em Área (volta do player)', params: [
    { key: 'userid', label: 'Player (userid)', placeholder: '{{trigger.userid}}' },
    { key: 'radius', label: 'Raio', placeholder: '15' },
    { key: 'filter', label: 'Filtro: mobs / hostile / prefab / all', placeholder: 'mobs' },
    { key: 'prefab', label: 'Prefab (se filter=prefab)', placeholder: 'spider' },
    { key: 'limit', label: 'Limite', placeholder: '200' },
  ] },
  { value: 'entity_extinguish', label: '💧 Entidade: Apagar Fogo', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X', placeholder: '' }, { key: 'z', label: 'Z', placeholder: '' }, { key: 'radius', label: 'Raio', placeholder: '8' },
  ] },
  { value: 'entity_ignite', label: '🔥 Entidade: Incendiar (ADMIN)', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X', placeholder: '' }, { key: 'z', label: 'Z', placeholder: '' }, { key: 'radius', label: 'Raio', placeholder: '8' },
  ] },
  { value: 'entity_set_fuel', label: '⛽ Entidade: Set Combustível', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X', placeholder: '' }, { key: 'z', label: 'Z', placeholder: '' }, { key: 'radius', label: 'Raio', placeholder: '8' },
    { key: 'percent', label: '% (0-1) OU', placeholder: '1' },
    { key: 'delta', label: 'Delta (+/-)', placeholder: '' },
  ] },
  { value: 'entity_freeze', label: '🧊 Entidade: Congelar', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X', placeholder: '' }, { key: 'z', label: 'Z', placeholder: '' }, { key: 'radius', label: 'Raio', placeholder: '8' },
    { key: 'coldness', label: 'Frio (intensidade)', placeholder: '1' },
  ] },
  { value: 'entity_unfreeze', label: '☀ Entidade: Descongelar', params: [
    { key: 'guid', label: 'GUID', placeholder: '{{trigger.guid}}' },
    { key: 'prefab', label: 'Prefab (se sem GUID)', placeholder: '' },
    { key: 'x', label: 'X', placeholder: '' }, { key: 'z', label: 'Z', placeholder: '' }, { key: 'radius', label: 'Raio', placeholder: '8' },
  ] },
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
  { value: 'ui_set', label: '🔧 Atualizar UI (prop)', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'ID da UI', placeholder: 'loja' },
    { key: 'node', label: 'Node ID', placeholder: 'saldo_txt' },
    { key: 'text', label: 'Texto', placeholder: 'Suas moedas: {{x}}' },
    { key: 'value', label: 'Valor (barra)', placeholder: '' },
    { key: 'visible', label: 'Visível (true/false)', placeholder: '' },
    { key: 'props', label: 'Props JSON (avançado)', placeholder: '{"color":[1,0,0,1]}' },
  ] },
  { value: 'ui_destroy', label: '❌ Remover Widget', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'id', label: 'Widget ID', placeholder: 'meu_label' },
  ] },
  { value: 'ui_clear', label: '🧹 Limpar Widgets', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
  ] },
  { value: 'rule_install', label: '🖥️ Instalar Regra HUD (JSON)', params: [
    { key: 'userid', label: 'Player (vazio = todos)', placeholder: '{{trigger.userid}}' },
    { key: 'rules', label: 'Rules JSON', placeholder: '[{"id":"my_rule","when":{"event":"healthdelta"},"do":[...]}]' },
  ] },
  { value: 'rule_uninstall', label: '🖥️ Remover HUD', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'ids', label: 'IDs das regras (vírgula)', placeholder: 'health_bar,coins_label' },
  ] },
  { value: 'rule_set_state', label: '🗃 Setar Estado Client', params: [
    { key: 'userid', label: 'Player', placeholder: '{{trigger.userid}}' },
    { key: 'key', label: 'Chave', placeholder: 'coins' },
    { key: 'value', label: 'Valor', placeholder: '100' },
  ] },
]
