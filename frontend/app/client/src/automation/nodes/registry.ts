// Frontend node registry — the client-side half of the module-per-node system.
// Mirrors the backend registry (app/server/live/nodes/registry.ts): one explicit
// import per migrated node, no glob. Each node contributes its meta (shared) and
// ui (the canvas component). Everything the editor needs — nodeTypes, palette
// entries, defaults, output schemas, colors — derives from here.
//
// During migration this only holds MIGRATED nodes; the legacy index.ts / catalog
// arrays fill the rest. Once all nodes are migrated, the legacy lists are removed.
import { createElement, type ComponentType } from 'react'
import { NodeDescriptionContext } from './BaseNode'
import type { NodeMeta } from '@shared/automation/nodeMeta'
import type { NodeOutputSchema } from '@shared/automation/outputSchema'

import { meta as delayMeta } from '@shared/automation/nodes/logic/timing/delay/meta'
import { ui as delayUi } from '@shared/automation/nodes/logic/timing/delay/ui'
import { meta as setVarMeta } from '@shared/automation/nodes/data/vars/set_variable/meta'
import { ui as setVarUi } from '@shared/automation/nodes/data/vars/set_variable/ui'
import { meta as getPlayerMeta } from '@shared/automation/nodes/data/player/get_player/meta'
import { ui as getPlayerUi } from '@shared/automation/nodes/data/player/get_player/ui'
import { meta as getServerInfoMeta } from '@shared/automation/nodes/data/server/get_server_info/meta'
import { ui as getServerInfoUi } from '@shared/automation/nodes/data/server/get_server_info/ui'
import { meta as getInventoryMeta } from '@shared/automation/nodes/data/player/get_player_inventory/meta'
import { ui as getInventoryUi } from '@shared/automation/nodes/data/player/get_player_inventory/ui'
import { meta as getBuffsMeta } from '@shared/automation/nodes/data/player/get_player_buffs/meta'
import { ui as getBuffsUi } from '@shared/automation/nodes/data/player/get_player_buffs/ui'
import { meta as listAllPlayersMeta } from '@shared/automation/nodes/data/player/list_all_players/meta'
import { ui as listAllPlayersUi } from '@shared/automation/nodes/data/player/list_all_players/ui'
import { meta as findPlayerMeta } from '@shared/automation/nodes/data/player/find_player/meta'
import { ui as findPlayerUi } from '@shared/automation/nodes/data/player/find_player/ui'
import { meta as playerStateMeta } from '@shared/automation/nodes/data/player/player_state/meta'
import { ui as playerStateUi } from '@shared/automation/nodes/data/player/player_state/ui'
import { meta as callComponentMeta } from '@shared/automation/nodes/data/player/call_component/meta'
import { ui as callComponentUi } from '@shared/automation/nodes/data/player/call_component/ui'
import { meta as landClaimMeta } from '@shared/automation/nodes/data/world/land_claim/meta'
import { ui as landClaimUi } from '@shared/automation/nodes/data/world/land_claim/ui'
import { meta as memoryMeta } from '@shared/automation/nodes/data/store/memory/meta'
import { ui as memoryUi } from '@shared/automation/nodes/data/store/memory/ui'
import { meta as listFlowsMeta } from '@shared/automation/nodes/data/store/list_flows/meta'
import { ui as listFlowsUi } from '@shared/automation/nodes/data/store/list_flows/ui'
import { meta as httpMeta } from '@shared/automation/nodes/actions/http/http_request/meta'
import { ui as httpUi } from '@shared/automation/nodes/actions/http/http_request/ui'
import { meta as scriptMeta } from '@shared/automation/nodes/actions/code/script/meta'
import { ui as scriptUi } from '@shared/automation/nodes/actions/code/script/ui'
import { meta as uiBuilderMeta } from '@shared/automation/nodes/ui/builder/ui_builder/meta'
import { ui as uiBuilderUi } from '@shared/automation/nodes/ui/builder/ui_builder/ui'
import { meta as conditionMeta } from '@shared/automation/nodes/logic/branch/condition/meta'
import { ui as conditionUi } from '@shared/automation/nodes/logic/branch/condition/ui'
import { meta as switchMeta } from '@shared/automation/nodes/logic/branch/switch/meta'
import { ui as switchUi } from '@shared/automation/nodes/logic/branch/switch/ui'
import { meta as foreachMeta } from '@shared/automation/nodes/logic/loop/foreach/meta'
import { ui as foreachUi } from '@shared/automation/nodes/logic/loop/foreach/ui'
import { meta as loopMeta } from '@shared/automation/nodes/logic/loop/loop/meta'
import { ui as loopUi } from '@shared/automation/nodes/logic/loop/loop/ui'
import { meta as breakMeta } from '@shared/automation/nodes/logic/loop/break/meta'
import { ui as breakUi } from '@shared/automation/nodes/logic/loop/break/ui'
import { meta as editVarMeta } from '@shared/automation/nodes/data/vars/edit_variable/meta'
import { ui as editVarUi } from '@shared/automation/nodes/data/vars/edit_variable/ui'
import { meta as aggregateMeta } from '@shared/automation/nodes/data/vars/aggregate/meta'
import { ui as aggregateUi } from '@shared/automation/nodes/data/vars/aggregate/ui'
import { meta as datetimeMeta } from '@shared/automation/nodes/data/transform/datetime/meta'
import { ui as datetimeUi } from '@shared/automation/nodes/data/transform/datetime/ui'
import { meta as tryCatchMeta } from '@shared/automation/nodes/logic/branch/try_catch/meta'
import { ui as tryCatchUi } from '@shared/automation/nodes/logic/branch/try_catch/ui'
import { meta as filterMeta } from '@shared/automation/nodes/logic/branch/filter/meta'
import { ui as filterUi } from '@shared/automation/nodes/logic/branch/filter/ui'
import { meta as logMeta } from '@shared/automation/nodes/data/debug/log/meta'
import { ui as logUi } from '@shared/automation/nodes/data/debug/log/ui'
import { meta as randomMeta } from '@shared/automation/nodes/data/random/random/meta'
import { ui as randomUi } from '@shared/automation/nodes/data/random/random/ui'
import { meta as transformMeta } from '@shared/automation/nodes/data/transform/transform/meta'
import { ui as transformUi } from '@shared/automation/nodes/data/transform/transform/ui'
import { meta as splitMeta } from '@shared/automation/nodes/data/transform/split/meta'
import { ui as splitUi } from '@shared/automation/nodes/data/transform/split/ui'
import { meta as actionMeta } from '@shared/automation/nodes/actions/game/action/meta'
import { ui as actionUi } from '@shared/automation/nodes/actions/game/action/ui'
import { meta as teleportMeta } from '@shared/automation/nodes/actions/game/teleport/meta'
import { ui as teleportUi } from '@shared/automation/nodes/actions/game/teleport/ui'
import { meta as healMeta } from '@shared/automation/nodes/actions/game/heal/meta'
import { ui as healUi } from '@shared/automation/nodes/actions/game/heal/ui'
import { meta as kickMeta } from '@shared/automation/nodes/actions/game/kick/meta'
import { ui as kickUi } from '@shared/automation/nodes/actions/game/kick/ui'
import { meta as killMeta } from '@shared/automation/nodes/actions/game/kill/meta'
import { ui as killUi } from '@shared/automation/nodes/actions/game/kill/ui'
import { meta as respawnMeta } from '@shared/automation/nodes/actions/game/respawn/meta'
import { ui as respawnUi } from '@shared/automation/nodes/actions/game/respawn/ui'
import { meta as giveItemMeta } from '@shared/automation/nodes/actions/game/give_item/meta'
import { ui as giveItemUi } from '@shared/automation/nodes/actions/game/give_item/ui'
import { meta as uiPanelMeta } from '@shared/automation/nodes/ui/builder/ui_panel/meta'
import { ui as uiPanelUi } from '@shared/automation/nodes/ui/builder/ui_panel/ui'
import { meta as aiAgentMeta } from '@shared/automation/nodes/ai/agent/ai_agent/meta'
import { ui as aiAgentUi } from '@shared/automation/nodes/ai/agent/ai_agent/ui'
import { meta as uiColMeta } from '@shared/automation/nodes/ui/primitives/ui_col/meta'
import { ui as uiColUi } from '@shared/automation/nodes/ui/primitives/ui_col/ui'
import { meta as uiRowMeta } from '@shared/automation/nodes/ui/primitives/ui_row/meta'
import { ui as uiRowUi } from '@shared/automation/nodes/ui/primitives/ui_row/ui'
import { meta as uiTabsMeta } from '@shared/automation/nodes/ui/primitives/ui_tabs/meta'
import { ui as uiTabsUi } from '@shared/automation/nodes/ui/primitives/ui_tabs/ui'
import { meta as uiTextMeta } from '@shared/automation/nodes/ui/primitives/ui_text/meta'
import { ui as uiTextUi } from '@shared/automation/nodes/ui/primitives/ui_text/ui'
import { meta as uiTextInputMeta } from '@shared/automation/nodes/ui/primitives/ui_text_input/meta'
import { ui as uiTextInputUi } from '@shared/automation/nodes/ui/primitives/ui_text_input/ui'
import { meta as uiIconMeta } from '@shared/automation/nodes/ui/primitives/ui_icon/meta'
import { ui as uiIconUi } from '@shared/automation/nodes/ui/primitives/ui_icon/ui'
import { meta as uiButtonMeta } from '@shared/automation/nodes/ui/primitives/ui_button/meta'
import { ui as uiButtonUi } from '@shared/automation/nodes/ui/primitives/ui_button/ui'
import { meta as uiBarMeta } from '@shared/automation/nodes/ui/primitives/ui_bar/meta'
import { ui as uiBarUi } from '@shared/automation/nodes/ui/primitives/ui_bar/ui'
import { meta as uiSpacerMeta } from '@shared/automation/nodes/ui/primitives/ui_spacer/meta'
import { ui as uiSpacerUi } from '@shared/automation/nodes/ui/primitives/ui_spacer/ui'
import { meta as uiMenuMeta } from '@shared/automation/nodes/ui/interactive/ui_menu/meta'
import { ui as uiMenuUi } from '@shared/automation/nodes/ui/interactive/ui_menu/ui'
import { meta as uiRuleMeta } from '@shared/automation/nodes/ui/interactive/ui_rule/meta'
import { ui as uiRuleUi } from '@shared/automation/nodes/ui/interactive/ui_rule/ui'
import { meta as aiMemoryMeta } from '@shared/automation/nodes/ai/memory/ai_memory/meta'
import { ui as aiMemoryUi } from '@shared/automation/nodes/ai/memory/ai_memory/ui'
import { meta as triggerMeta } from '@shared/automation/nodes/triggers/game/trigger/meta'
import { ui as triggerUi } from '@shared/automation/nodes/triggers/game/trigger/ui'
import { meta as webhookMeta } from '@shared/automation/nodes/triggers/net/webhook/meta'
import { ui as webhookUi } from '@shared/automation/nodes/triggers/net/webhook/ui'
import { meta as waitMeta } from '@shared/automation/nodes/logic/merge/wait/meta'
import { ui as waitUi } from '@shared/automation/nodes/logic/merge/wait/ui'

// BEGIN GEN-ACTIONS client
import { meta as announceMeta } from '@shared/automation/nodes/actions/communication/announce/meta'
import { ui as announceUi } from '@shared/automation/nodes/actions/communication/announce/ui'
import { meta as privateMessageMeta } from '@shared/automation/nodes/actions/communication/private_message/meta'
import { ui as privateMessageUi } from '@shared/automation/nodes/actions/communication/private_message/ui'
import { meta as chatSendMeta } from '@shared/automation/nodes/actions/communication/chat_send/meta'
import { ui as chatSendUi } from '@shared/automation/nodes/actions/communication/chat_send/ui'
import { meta as feedMeta } from '@shared/automation/nodes/actions/player/feed/meta'
import { ui as feedUi } from '@shared/automation/nodes/actions/player/feed/ui'
import { meta as restoreSanityMeta } from '@shared/automation/nodes/actions/player/restore_sanity/meta'
import { ui as restoreSanityUi } from '@shared/automation/nodes/actions/player/restore_sanity/ui'
import { meta as godmodeMeta } from '@shared/automation/nodes/actions/player/godmode/meta'
import { ui as godmodeUi } from '@shared/automation/nodes/actions/player/godmode/ui'
import { meta as teleportToPlayerMeta } from '@shared/automation/nodes/actions/player/teleport_to_player/meta'
import { ui as teleportToPlayerUi } from '@shared/automation/nodes/actions/player/teleport_to_player/ui'
import { meta as setSeasonMeta } from '@shared/automation/nodes/actions/world/set_season/meta'
import { ui as setSeasonUi } from '@shared/automation/nodes/actions/world/set_season/ui'
import { meta as setPhaseMeta } from '@shared/automation/nodes/actions/world/set_phase/meta'
import { ui as setPhaseUi } from '@shared/automation/nodes/actions/world/set_phase/ui'
import { meta as skipDayMeta } from '@shared/automation/nodes/actions/world/skip_day/meta'
import { ui as skipDayUi } from '@shared/automation/nodes/actions/world/skip_day/ui'
import { meta as setRainMeta } from '@shared/automation/nodes/actions/world/set_rain/meta'
import { ui as setRainUi } from '@shared/automation/nodes/actions/world/set_rain/ui'
import { meta as stopRainMeta } from '@shared/automation/nodes/actions/world/stop_rain/meta'
import { ui as stopRainUi } from '@shared/automation/nodes/actions/world/stop_rain/ui'
import { meta as pauseMeta } from '@shared/automation/nodes/actions/world/pause/meta'
import { ui as pauseUi } from '@shared/automation/nodes/actions/world/pause/ui'
import { meta as unpauseMeta } from '@shared/automation/nodes/actions/world/unpause/meta'
import { ui as unpauseUi } from '@shared/automation/nodes/actions/world/unpause/ui'
import { meta as setSpeedMeta } from '@shared/automation/nodes/actions/world/set_speed/meta'
import { ui as setSpeedUi } from '@shared/automation/nodes/actions/world/set_speed/ui'
import { meta as rollbackMeta } from '@shared/automation/nodes/actions/admin/rollback/meta'
import { ui as rollbackUi } from '@shared/automation/nodes/actions/admin/rollback/ui'
import { meta as executeMeta } from '@shared/automation/nodes/actions/admin/execute/meta'
import { ui as executeUi } from '@shared/automation/nodes/actions/admin/execute/ui'
import { meta as banMeta } from '@shared/automation/nodes/actions/admin/ban/meta'
import { ui as banUi } from '@shared/automation/nodes/actions/admin/ban/ui'
import { meta as lightningMeta } from '@shared/automation/nodes/actions/player/lightning/meta'
import { ui as lightningUi } from '@shared/automation/nodes/actions/player/lightning/ui'
import { meta as regenerateMeta } from '@shared/automation/nodes/actions/admin/regenerate/meta'
import { ui as regenerateUi } from '@shared/automation/nodes/actions/admin/regenerate/ui'
import { meta as setNextPhaseMeta } from '@shared/automation/nodes/actions/world/set_next_phase/meta'
import { ui as setNextPhaseUi } from '@shared/automation/nodes/actions/world/set_next_phase/ui'
import { meta as setSnowMeta } from '@shared/automation/nodes/actions/world/set_snow/meta'
import { ui as setSnowUi } from '@shared/automation/nodes/actions/world/set_snow/ui'
import { meta as setDayLengthMeta } from '@shared/automation/nodes/actions/world/set_day_length/meta'
import { ui as setDayLengthUi } from '@shared/automation/nodes/actions/world/set_day_length/ui'
import { meta as setSeasonLengthMeta } from '@shared/automation/nodes/actions/world/set_season_length/meta'
import { ui as setSeasonLengthUi } from '@shared/automation/nodes/actions/world/set_season_length/ui'
import { meta as removeInventoryMeta } from '@shared/automation/nodes/actions/inventory/remove_inventory/meta'
import { ui as removeInventoryUi } from '@shared/automation/nodes/actions/inventory/remove_inventory/ui'
import { meta as removeItemMeta } from '@shared/automation/nodes/actions/inventory/remove_item/meta'
import { ui as removeItemUi } from '@shared/automation/nodes/actions/inventory/remove_item/ui'
import { meta as countItemMeta } from '@shared/automation/nodes/actions/inventory/count_item/meta'
import { ui as countItemUi } from '@shared/automation/nodes/actions/inventory/count_item/ui'
import { meta as hasItemMeta } from '@shared/automation/nodes/actions/inventory/has_item/meta'
import { ui as hasItemUi } from '@shared/automation/nodes/actions/inventory/has_item/ui'
import { meta as equipItemMeta } from '@shared/automation/nodes/actions/inventory/equip_item/meta'
import { ui as equipItemUi } from '@shared/automation/nodes/actions/inventory/equip_item/ui'
import { meta as unequipMeta } from '@shared/automation/nodes/actions/inventory/unequip/meta'
import { ui as unequipUi } from '@shared/automation/nodes/actions/inventory/unequip/ui'
import { meta as dropItemMeta } from '@shared/automation/nodes/actions/inventory/drop_item/meta'
import { ui as dropItemUi } from '@shared/automation/nodes/actions/inventory/drop_item/ui'
import { meta as clearInventoryMeta } from '@shared/automation/nodes/actions/inventory/clear_inventory/meta'
import { ui as clearInventoryUi } from '@shared/automation/nodes/actions/inventory/clear_inventory/ui'
import { meta as transferItemMeta } from '@shared/automation/nodes/actions/inventory/transfer_item/meta'
import { ui as transferItemUi } from '@shared/automation/nodes/actions/inventory/transfer_item/ui'
import { meta as dumpInventoryMeta } from '@shared/automation/nodes/actions/inventory/dump_inventory/meta'
import { ui as dumpInventoryUi } from '@shared/automation/nodes/actions/inventory/dump_inventory/ui'
import { meta as uiTrackMeta } from '@shared/automation/nodes/actions/interface/ui_track/meta'
import { ui as uiTrackUi } from '@shared/automation/nodes/actions/interface/ui_track/ui'
import { meta as spawnAtPlayerMeta } from '@shared/automation/nodes/actions/entity/spawn_at_player/meta'
import { ui as spawnAtPlayerUi } from '@shared/automation/nodes/actions/entity/spawn_at_player/ui'
import { meta as spawnPrefabMeta } from '@shared/automation/nodes/actions/entity/spawn_prefab/meta'
import { ui as spawnPrefabUi } from '@shared/automation/nodes/actions/entity/spawn_prefab/ui'
import { meta as removeNearPlayerMeta } from '@shared/automation/nodes/actions/entity/remove_near_player/meta'
import { ui as removeNearPlayerUi } from '@shared/automation/nodes/actions/entity/remove_near_player/ui'
import { meta as removeNearMeta } from '@shared/automation/nodes/actions/entity/remove_near/meta'
import { ui as removeNearUi } from '@shared/automation/nodes/actions/entity/remove_near/ui'
import { meta as destroyStructureMeta } from '@shared/automation/nodes/actions/entity/destroy_structure/meta'
import { ui as destroyStructureUi } from '@shared/automation/nodes/actions/entity/destroy_structure/ui'
import { meta as getEntityMeta } from '@shared/automation/nodes/actions/entity/get_entity/meta'
import { ui as getEntityUi } from '@shared/automation/nodes/actions/entity/get_entity/ui'
import { meta as entitySetHealthMeta } from '@shared/automation/nodes/actions/entity/entity_set_health/meta'
import { ui as entitySetHealthUi } from '@shared/automation/nodes/actions/entity/entity_set_health/ui'
import { meta as entityKillMeta } from '@shared/automation/nodes/actions/entity/entity_kill/meta'
import { ui as entityKillUi } from '@shared/automation/nodes/actions/entity/entity_kill/ui'
import { meta as killAreaMeta } from '@shared/automation/nodes/actions/entity/kill_area/meta'
import { ui as killAreaUi } from '@shared/automation/nodes/actions/entity/kill_area/ui'
import { meta as entityExtinguishMeta } from '@shared/automation/nodes/actions/entity/entity_extinguish/meta'
import { ui as entityExtinguishUi } from '@shared/automation/nodes/actions/entity/entity_extinguish/ui'
import { meta as entityIgniteMeta } from '@shared/automation/nodes/actions/entity/entity_ignite/meta'
import { ui as entityIgniteUi } from '@shared/automation/nodes/actions/entity/entity_ignite/ui'
import { meta as entitySetFuelMeta } from '@shared/automation/nodes/actions/entity/entity_set_fuel/meta'
import { ui as entitySetFuelUi } from '@shared/automation/nodes/actions/entity/entity_set_fuel/ui'
import { meta as entityFreezeMeta } from '@shared/automation/nodes/actions/entity/entity_freeze/meta'
import { ui as entityFreezeUi } from '@shared/automation/nodes/actions/entity/entity_freeze/ui'
import { meta as entityUnfreezeMeta } from '@shared/automation/nodes/actions/entity/entity_unfreeze/meta'
import { ui as entityUnfreezeUi } from '@shared/automation/nodes/actions/entity/entity_unfreeze/ui'
import { meta as uiNotificationMeta } from '@shared/automation/nodes/actions/interface/ui_notification/meta'
import { ui as uiNotificationUi } from '@shared/automation/nodes/actions/interface/ui_notification/ui'
import { meta as uiLabelMeta } from '@shared/automation/nodes/actions/interface/ui_label/meta'
import { ui as uiLabelUi } from '@shared/automation/nodes/actions/interface/ui_label/ui'
import { meta as uiProgressBarMeta } from '@shared/automation/nodes/actions/interface/ui_progress_bar/meta'
import { ui as uiProgressBarUi } from '@shared/automation/nodes/actions/interface/ui_progress_bar/ui'
import { meta as uiSetMeta } from '@shared/automation/nodes/actions/interface/ui_set/meta'
import { ui as uiSetUi } from '@shared/automation/nodes/actions/interface/ui_set/ui'
import { meta as uiDestroyMeta } from '@shared/automation/nodes/actions/interface/ui_destroy/meta'
import { ui as uiDestroyUi } from '@shared/automation/nodes/actions/interface/ui_destroy/ui'
import { meta as uiClearMeta } from '@shared/automation/nodes/actions/interface/ui_clear/meta'
import { ui as uiClearUi } from '@shared/automation/nodes/actions/interface/ui_clear/ui'
import { meta as ruleInstallMeta } from '@shared/automation/nodes/actions/rules/rule_install/meta'
import { ui as ruleInstallUi } from '@shared/automation/nodes/actions/rules/rule_install/ui'
import { meta as ruleUninstallMeta } from '@shared/automation/nodes/actions/rules/rule_uninstall/meta'
import { ui as ruleUninstallUi } from '@shared/automation/nodes/actions/rules/rule_uninstall/ui'
import { meta as ruleSetStateMeta } from '@shared/automation/nodes/actions/rules/rule_set_state/meta'
import { ui as ruleSetStateUi } from '@shared/automation/nodes/actions/rules/rule_set_state/ui'
// END GEN-ACTIONS client

interface FrontendNodeEntry {
  meta: NodeMeta
  ui: ComponentType<any>
}

// ── Registered node modules (one entry per migrated node) ──
const ENTRIES: FrontendNodeEntry[] = [
  { meta: delayMeta, ui: delayUi },
  { meta: setVarMeta, ui: setVarUi },
  { meta: getPlayerMeta, ui: getPlayerUi },
  { meta: getServerInfoMeta, ui: getServerInfoUi },
  { meta: getInventoryMeta, ui: getInventoryUi },
  { meta: getBuffsMeta, ui: getBuffsUi },
  { meta: listAllPlayersMeta, ui: listAllPlayersUi },
  { meta: findPlayerMeta, ui: findPlayerUi },
  { meta: playerStateMeta, ui: playerStateUi },
  { meta: callComponentMeta, ui: callComponentUi },
  { meta: landClaimMeta, ui: landClaimUi },
  { meta: memoryMeta, ui: memoryUi },
  { meta: listFlowsMeta, ui: listFlowsUi },
  { meta: httpMeta, ui: httpUi },
  { meta: scriptMeta, ui: scriptUi },
  { meta: uiBuilderMeta, ui: uiBuilderUi },
  { meta: conditionMeta, ui: conditionUi },
  { meta: switchMeta, ui: switchUi },
  { meta: foreachMeta, ui: foreachUi },
  { meta: loopMeta, ui: loopUi },
  { meta: breakMeta, ui: breakUi },
  { meta: editVarMeta, ui: editVarUi },
  { meta: aggregateMeta, ui: aggregateUi },
  { meta: datetimeMeta, ui: datetimeUi },
  { meta: tryCatchMeta, ui: tryCatchUi },
  { meta: filterMeta, ui: filterUi },
  { meta: logMeta, ui: logUi },
  { meta: randomMeta, ui: randomUi },
  { meta: transformMeta, ui: transformUi },
  { meta: splitMeta, ui: splitUi },
  { meta: actionMeta, ui: actionUi },
  { meta: teleportMeta, ui: teleportUi },
  { meta: healMeta, ui: healUi },
  { meta: kickMeta, ui: kickUi },
  { meta: killMeta, ui: killUi },
  { meta: respawnMeta, ui: respawnUi },
  { meta: giveItemMeta, ui: giveItemUi },
  // BEGIN GEN-ACTIONS entries
  { meta: announceMeta, ui: announceUi },
  { meta: privateMessageMeta, ui: privateMessageUi },
  { meta: chatSendMeta, ui: chatSendUi },
  { meta: feedMeta, ui: feedUi },
  { meta: restoreSanityMeta, ui: restoreSanityUi },
  { meta: godmodeMeta, ui: godmodeUi },
  { meta: teleportToPlayerMeta, ui: teleportToPlayerUi },
  { meta: setSeasonMeta, ui: setSeasonUi },
  { meta: setPhaseMeta, ui: setPhaseUi },
  { meta: skipDayMeta, ui: skipDayUi },
  { meta: setRainMeta, ui: setRainUi },
  { meta: stopRainMeta, ui: stopRainUi },
  { meta: pauseMeta, ui: pauseUi },
  { meta: unpauseMeta, ui: unpauseUi },
  { meta: setSpeedMeta, ui: setSpeedUi },
  { meta: rollbackMeta, ui: rollbackUi },
  { meta: executeMeta, ui: executeUi },
  { meta: banMeta, ui: banUi },
  { meta: lightningMeta, ui: lightningUi },
  { meta: regenerateMeta, ui: regenerateUi },
  { meta: setNextPhaseMeta, ui: setNextPhaseUi },
  { meta: setSnowMeta, ui: setSnowUi },
  { meta: setDayLengthMeta, ui: setDayLengthUi },
  { meta: setSeasonLengthMeta, ui: setSeasonLengthUi },
  { meta: removeInventoryMeta, ui: removeInventoryUi },
  { meta: removeItemMeta, ui: removeItemUi },
  { meta: countItemMeta, ui: countItemUi },
  { meta: hasItemMeta, ui: hasItemUi },
  { meta: equipItemMeta, ui: equipItemUi },
  { meta: unequipMeta, ui: unequipUi },
  { meta: dropItemMeta, ui: dropItemUi },
  { meta: clearInventoryMeta, ui: clearInventoryUi },
  { meta: transferItemMeta, ui: transferItemUi },
  { meta: dumpInventoryMeta, ui: dumpInventoryUi },
  { meta: uiTrackMeta, ui: uiTrackUi },
  { meta: spawnAtPlayerMeta, ui: spawnAtPlayerUi },
  { meta: spawnPrefabMeta, ui: spawnPrefabUi },
  { meta: removeNearPlayerMeta, ui: removeNearPlayerUi },
  { meta: removeNearMeta, ui: removeNearUi },
  { meta: destroyStructureMeta, ui: destroyStructureUi },
  { meta: getEntityMeta, ui: getEntityUi },
  { meta: entitySetHealthMeta, ui: entitySetHealthUi },
  { meta: entityKillMeta, ui: entityKillUi },
  { meta: killAreaMeta, ui: killAreaUi },
  { meta: entityExtinguishMeta, ui: entityExtinguishUi },
  { meta: entityIgniteMeta, ui: entityIgniteUi },
  { meta: entitySetFuelMeta, ui: entitySetFuelUi },
  { meta: entityFreezeMeta, ui: entityFreezeUi },
  { meta: entityUnfreezeMeta, ui: entityUnfreezeUi },
  { meta: uiNotificationMeta, ui: uiNotificationUi },
  { meta: uiLabelMeta, ui: uiLabelUi },
  { meta: uiProgressBarMeta, ui: uiProgressBarUi },
  { meta: uiSetMeta, ui: uiSetUi },
  { meta: uiDestroyMeta, ui: uiDestroyUi },
  { meta: uiClearMeta, ui: uiClearUi },
  { meta: ruleInstallMeta, ui: ruleInstallUi },
  { meta: ruleUninstallMeta, ui: ruleUninstallUi },
  { meta: ruleSetStateMeta, ui: ruleSetStateUi },
  // END GEN-ACTIONS entries
  { meta: uiPanelMeta, ui: uiPanelUi },
  { meta: aiAgentMeta, ui: aiAgentUi },
  { meta: uiColMeta, ui: uiColUi },
  { meta: uiRowMeta, ui: uiRowUi },
  { meta: uiTabsMeta, ui: uiTabsUi },
  { meta: uiTextMeta, ui: uiTextUi },
  { meta: uiTextInputMeta, ui: uiTextInputUi },
  { meta: uiIconMeta, ui: uiIconUi },
  { meta: uiButtonMeta, ui: uiButtonUi },
  { meta: uiBarMeta, ui: uiBarUi },
  { meta: uiSpacerMeta, ui: uiSpacerUi },
  { meta: uiMenuMeta, ui: uiMenuUi },
  { meta: uiRuleMeta, ui: uiRuleUi },
  { meta: aiMemoryMeta, ui: aiMemoryUi },
  { meta: triggerMeta, ui: triggerUi },
  { meta: webhookMeta, ui: webhookUi },
  { meta: waitMeta, ui: waitUi },
]

// ── Derived maps (consumed by FlowEditor / NodeDetailPanel / nodes/index) ──

/** type → canvas component (merged into ReactFlow nodeTypes). Each ui is wrapped
 *  so BaseNode can read the node's meta.description from context and show it on
 *  the card — without every ui.tsx passing it. */
export const registryNodeTypes: Record<string, ComponentType<any>> =
  Object.fromEntries(ENTRIES.map(e => {
    const Ui = e.ui
    const desc = e.meta.description
    const Wrapped = (props: any) =>
      createElement(NodeDescriptionContext.Provider, { value: desc }, createElement(Ui, props))
    return [e.meta.type, Wrapped]
  }))

/** type → meta (icon/label/color/category…). */
export const registryMetaByType: Record<string, NodeMeta> =
  Object.fromEntries(ENTRIES.map(e => [e.meta.type, e.meta]))

/** type → initial node.data (palette create defaults). */
export const registryDefaults: Record<string, any> =
  Object.fromEntries(ENTRIES.map(e => [e.meta.type, e.meta.defaults ?? {}]))

/** type → output schema (for {{node.field}} autocomplete). */
export const registryOutputSchemas: Record<string, NodeOutputSchema> =
  Object.fromEntries(ENTRIES.filter(e => e.meta.outputSchema).map(e => [e.meta.type, e.meta.outputSchema!]))

/** Palette catalog items for migrated, non-hidden nodes. `family` comes from the
 *  node's own meta.kind — the node declares its menu family, no string guessing. */
export const registryCatalog = ENTRIES
  .filter(e => !e.meta.hidden)
  .map(e => ({
    type: e.meta.type,
    label: e.meta.label,
    description: e.meta.description,
    category: e.meta.category,
    subgroup: e.meta.subgroup,
    family: e.meta.kind,
    icon: e.meta.icon,
    accent: e.meta.accent ?? 'text-gray-400',
    data: e.meta.defaults,
  }))

/** Set of types owned by the registry (so legacy lists can skip them). */
export const registryTypes = new Set(ENTRIES.map(e => e.meta.type))
