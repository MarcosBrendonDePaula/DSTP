// Backend node registry — the single place that knows which node types have a
// migrated module (meta + exec handler). Registration is by EXPLICIT static
// import: the backend ships as one bundled dist/index.js, so runtime FS globs
// (Bun.Glob) or import.meta.glob (unsupported by Bun) would break in production.
// Static imports are followed by the bundler and work in dev and prod alike.
//
// To migrate a node: add its folder under app/shared/automation/nodes/<type>/
// (meta.ts + exec.ts) and add ONE line below. Everything else (dispatch, palette,
// FlowAnalyzer flags) derives from this registry. Until a node is registered here,
// the engine falls back to the legacy if/else in processNode.
import type { NodeMeta } from '@shared/automation/nodeMeta'
import type { NodeHandler } from './types'

import { meta as delayMeta } from '@shared/automation/nodes/logic/timing/delay/meta'
import { handler as delayHandler } from '@shared/automation/nodes/logic/timing/delay/exec'
import { meta as setVarMeta } from '@shared/automation/nodes/data/vars/set_variable/meta'
import { handler as setVarHandler } from '@shared/automation/nodes/data/vars/set_variable/exec'
import { meta as getPlayerMeta } from '@shared/automation/nodes/data/player/get_player/meta'
import { handler as getPlayerHandler } from '@shared/automation/nodes/data/player/get_player/exec'
import { meta as getServerInfoMeta } from '@shared/automation/nodes/data/server/get_server_info/meta'
import { handler as getServerInfoHandler } from '@shared/automation/nodes/data/server/get_server_info/exec'
import { meta as getInventoryMeta } from '@shared/automation/nodes/data/player/get_player_inventory/meta'
import { handler as getInventoryHandler } from '@shared/automation/nodes/data/player/get_player_inventory/exec'
import { meta as getBuffsMeta } from '@shared/automation/nodes/data/player/get_player_buffs/meta'
import { handler as getBuffsHandler } from '@shared/automation/nodes/data/player/get_player_buffs/exec'
import { meta as listAllPlayersMeta } from '@shared/automation/nodes/data/player/list_all_players/meta'
import { handler as listAllPlayersHandler } from '@shared/automation/nodes/data/player/list_all_players/exec'
import { meta as findPlayerMeta } from '@shared/automation/nodes/data/player/find_player/meta'
import { handler as findPlayerHandler } from '@shared/automation/nodes/data/player/find_player/exec'
import { meta as playerStateMeta } from '@shared/automation/nodes/data/player/player_state/meta'
import { handler as playerStateHandler } from '@shared/automation/nodes/data/player/player_state/exec'
import { meta as callComponentMeta } from '@shared/automation/nodes/data/player/call_component/meta'
import { handler as callComponentHandler } from '@shared/automation/nodes/data/player/call_component/exec'
import { meta as landClaimMeta } from '@shared/automation/nodes/data/world/land_claim/meta'
import { handler as landClaimHandler } from '@shared/automation/nodes/data/world/land_claim/exec'
import { meta as memoryMeta } from '@shared/automation/nodes/data/store/memory/meta'
import { handler as memoryHandler } from '@shared/automation/nodes/data/store/memory/exec'
import { meta as listFlowsMeta } from '@shared/automation/nodes/data/store/list_flows/meta'
import { handler as listFlowsHandler } from '@shared/automation/nodes/data/store/list_flows/exec'
import { meta as httpMeta } from '@shared/automation/nodes/actions/http/http_request/meta'
import { handler as httpHandler } from '@shared/automation/nodes/actions/http/http_request/exec'
import { meta as scriptMeta } from '@shared/automation/nodes/actions/code/script/meta'
import { handler as scriptHandler } from '@shared/automation/nodes/actions/code/script/exec'
import { meta as uiBuilderMeta } from '@shared/automation/nodes/ui/builder/ui_builder/meta'
import { handler as uiBuilderHandler } from '@shared/automation/nodes/ui/builder/ui_builder/exec'
import { meta as conditionMeta } from '@shared/automation/nodes/logic/branch/condition/meta'
import { handler as conditionHandler } from '@shared/automation/nodes/logic/branch/condition/exec'
import { meta as switchMeta } from '@shared/automation/nodes/logic/branch/switch/meta'
import { handler as switchHandler } from '@shared/automation/nodes/logic/branch/switch/exec'
import { meta as foreachMeta } from '@shared/automation/nodes/logic/loop/foreach/meta'
import { handler as foreachHandler } from '@shared/automation/nodes/logic/loop/foreach/exec'
import { meta as loopMeta } from '@shared/automation/nodes/logic/loop/loop/meta'
import { handler as loopHandler } from '@shared/automation/nodes/logic/loop/loop/exec'
import { meta as breakMeta } from '@shared/automation/nodes/logic/loop/break/meta'
import { handler as breakHandler } from '@shared/automation/nodes/logic/loop/break/exec'
import { meta as editVarMeta } from '@shared/automation/nodes/data/vars/edit_variable/meta'
import { handler as editVarHandler } from '@shared/automation/nodes/data/vars/edit_variable/exec'
import { meta as aggregateMeta } from '@shared/automation/nodes/data/vars/aggregate/meta'
import { handler as aggregateHandler } from '@shared/automation/nodes/data/vars/aggregate/exec'
import { meta as datetimeMeta } from '@shared/automation/nodes/data/transform/datetime/meta'
import { handler as datetimeHandler } from '@shared/automation/nodes/data/transform/datetime/exec'
import { meta as tryCatchMeta } from '@shared/automation/nodes/logic/branch/try_catch/meta'
import { handler as tryCatchHandler } from '@shared/automation/nodes/logic/branch/try_catch/exec'
import { meta as filterMeta } from '@shared/automation/nodes/logic/branch/filter/meta'
import { handler as filterHandler } from '@shared/automation/nodes/logic/branch/filter/exec'
import { meta as logMeta } from '@shared/automation/nodes/data/debug/log/meta'
import { handler as logHandler } from '@shared/automation/nodes/data/debug/log/exec'
import { meta as randomMeta } from '@shared/automation/nodes/data/random/random/meta'
import { handler as randomHandler } from '@shared/automation/nodes/data/random/random/exec'
import { meta as transformMeta } from '@shared/automation/nodes/data/transform/transform/meta'
import { handler as transformHandler } from '@shared/automation/nodes/data/transform/transform/exec'
import { meta as splitMeta } from '@shared/automation/nodes/data/transform/split/meta'
import { handler as splitHandler } from '@shared/automation/nodes/data/transform/split/exec'
import { meta as actionMeta } from '@shared/automation/nodes/actions/game/action/meta'
import { handler as actionHandler } from '@shared/automation/nodes/actions/game/action/exec'
import { meta as teleportMeta } from '@shared/automation/nodes/actions/game/teleport/meta'
import { handler as teleportHandler } from '@shared/automation/nodes/actions/game/teleport/exec'
import { meta as healMeta } from '@shared/automation/nodes/actions/game/heal/meta'
import { handler as healHandler } from '@shared/automation/nodes/actions/game/heal/exec'
import { meta as kickMeta } from '@shared/automation/nodes/actions/game/kick/meta'
import { handler as kickHandler } from '@shared/automation/nodes/actions/game/kick/exec'
import { meta as killMeta } from '@shared/automation/nodes/actions/game/kill/meta'
import { handler as killHandler } from '@shared/automation/nodes/actions/game/kill/exec'
import { meta as respawnMeta } from '@shared/automation/nodes/actions/game/respawn/meta'
import { handler as respawnHandler } from '@shared/automation/nodes/actions/game/respawn/exec'
import { meta as giveItemMeta } from '@shared/automation/nodes/actions/game/give_item/meta'
import { handler as giveItemHandler } from '@shared/automation/nodes/actions/game/give_item/exec'
// BEGIN GEN-ACTIONS server
import { meta as announceMeta } from '@shared/automation/nodes/actions/communication/announce/meta'
import { handler as announceHandler } from '@shared/automation/nodes/actions/communication/announce/exec'
import { meta as privateMessageMeta } from '@shared/automation/nodes/actions/communication/private_message/meta'
import { handler as privateMessageHandler } from '@shared/automation/nodes/actions/communication/private_message/exec'
import { meta as chatSendMeta } from '@shared/automation/nodes/actions/communication/chat_send/meta'
import { handler as chatSendHandler } from '@shared/automation/nodes/actions/communication/chat_send/exec'
import { meta as feedMeta } from '@shared/automation/nodes/actions/player/feed/meta'
import { handler as feedHandler } from '@shared/automation/nodes/actions/player/feed/exec'
import { meta as restoreSanityMeta } from '@shared/automation/nodes/actions/player/restore_sanity/meta'
import { handler as restoreSanityHandler } from '@shared/automation/nodes/actions/player/restore_sanity/exec'
import { meta as godmodeMeta } from '@shared/automation/nodes/actions/player/godmode/meta'
import { handler as godmodeHandler } from '@shared/automation/nodes/actions/player/godmode/exec'
import { meta as teleportToPlayerMeta } from '@shared/automation/nodes/actions/player/teleport_to_player/meta'
import { handler as teleportToPlayerHandler } from '@shared/automation/nodes/actions/player/teleport_to_player/exec'
import { meta as setSeasonMeta } from '@shared/automation/nodes/actions/world/set_season/meta'
import { handler as setSeasonHandler } from '@shared/automation/nodes/actions/world/set_season/exec'
import { meta as setPhaseMeta } from '@shared/automation/nodes/actions/world/set_phase/meta'
import { handler as setPhaseHandler } from '@shared/automation/nodes/actions/world/set_phase/exec'
import { meta as skipDayMeta } from '@shared/automation/nodes/actions/world/skip_day/meta'
import { handler as skipDayHandler } from '@shared/automation/nodes/actions/world/skip_day/exec'
import { meta as setRainMeta } from '@shared/automation/nodes/actions/world/set_rain/meta'
import { handler as setRainHandler } from '@shared/automation/nodes/actions/world/set_rain/exec'
import { meta as stopRainMeta } from '@shared/automation/nodes/actions/world/stop_rain/meta'
import { handler as stopRainHandler } from '@shared/automation/nodes/actions/world/stop_rain/exec'
import { meta as pauseMeta } from '@shared/automation/nodes/actions/world/pause/meta'
import { handler as pauseHandler } from '@shared/automation/nodes/actions/world/pause/exec'
import { meta as unpauseMeta } from '@shared/automation/nodes/actions/world/unpause/meta'
import { handler as unpauseHandler } from '@shared/automation/nodes/actions/world/unpause/exec'
import { meta as setSpeedMeta } from '@shared/automation/nodes/actions/world/set_speed/meta'
import { handler as setSpeedHandler } from '@shared/automation/nodes/actions/world/set_speed/exec'
import { meta as rollbackMeta } from '@shared/automation/nodes/actions/admin/rollback/meta'
import { handler as rollbackHandler } from '@shared/automation/nodes/actions/admin/rollback/exec'
import { meta as executeMeta } from '@shared/automation/nodes/actions/admin/execute/meta'
import { handler as executeHandler } from '@shared/automation/nodes/actions/admin/execute/exec'
import { meta as banMeta } from '@shared/automation/nodes/actions/admin/ban/meta'
import { handler as banHandler } from '@shared/automation/nodes/actions/admin/ban/exec'
import { meta as lightningMeta } from '@shared/automation/nodes/actions/player/lightning/meta'
import { handler as lightningHandler } from '@shared/automation/nodes/actions/player/lightning/exec'
import { meta as regenerateMeta } from '@shared/automation/nodes/actions/admin/regenerate/meta'
import { handler as regenerateHandler } from '@shared/automation/nodes/actions/admin/regenerate/exec'
import { meta as setNextPhaseMeta } from '@shared/automation/nodes/actions/world/set_next_phase/meta'
import { handler as setNextPhaseHandler } from '@shared/automation/nodes/actions/world/set_next_phase/exec'
import { meta as setSnowMeta } from '@shared/automation/nodes/actions/world/set_snow/meta'
import { handler as setSnowHandler } from '@shared/automation/nodes/actions/world/set_snow/exec'
import { meta as setDayLengthMeta } from '@shared/automation/nodes/actions/world/set_day_length/meta'
import { handler as setDayLengthHandler } from '@shared/automation/nodes/actions/world/set_day_length/exec'
import { meta as setSeasonLengthMeta } from '@shared/automation/nodes/actions/world/set_season_length/meta'
import { handler as setSeasonLengthHandler } from '@shared/automation/nodes/actions/world/set_season_length/exec'
import { meta as removeInventoryMeta } from '@shared/automation/nodes/actions/inventory/remove_inventory/meta'
import { handler as removeInventoryHandler } from '@shared/automation/nodes/actions/inventory/remove_inventory/exec'
import { meta as removeItemMeta } from '@shared/automation/nodes/actions/inventory/remove_item/meta'
import { handler as removeItemHandler } from '@shared/automation/nodes/actions/inventory/remove_item/exec'
import { meta as countItemMeta } from '@shared/automation/nodes/actions/inventory/count_item/meta'
import { handler as countItemHandler } from '@shared/automation/nodes/actions/inventory/count_item/exec'
import { meta as hasItemMeta } from '@shared/automation/nodes/actions/inventory/has_item/meta'
import { handler as hasItemHandler } from '@shared/automation/nodes/actions/inventory/has_item/exec'
import { meta as equipItemMeta } from '@shared/automation/nodes/actions/inventory/equip_item/meta'
import { handler as equipItemHandler } from '@shared/automation/nodes/actions/inventory/equip_item/exec'
import { meta as unequipMeta } from '@shared/automation/nodes/actions/inventory/unequip/meta'
import { handler as unequipHandler } from '@shared/automation/nodes/actions/inventory/unequip/exec'
import { meta as dropItemMeta } from '@shared/automation/nodes/actions/inventory/drop_item/meta'
import { handler as dropItemHandler } from '@shared/automation/nodes/actions/inventory/drop_item/exec'
import { meta as clearInventoryMeta } from '@shared/automation/nodes/actions/inventory/clear_inventory/meta'
import { handler as clearInventoryHandler } from '@shared/automation/nodes/actions/inventory/clear_inventory/exec'
import { meta as transferItemMeta } from '@shared/automation/nodes/actions/inventory/transfer_item/meta'
import { handler as transferItemHandler } from '@shared/automation/nodes/actions/inventory/transfer_item/exec'
import { meta as dumpInventoryMeta } from '@shared/automation/nodes/actions/inventory/dump_inventory/meta'
import { handler as dumpInventoryHandler } from '@shared/automation/nodes/actions/inventory/dump_inventory/exec'
import { meta as uiTrackMeta } from '@shared/automation/nodes/actions/interface/ui_track/meta'
import { handler as uiTrackHandler } from '@shared/automation/nodes/actions/interface/ui_track/exec'
import { meta as spawnAtPlayerMeta } from '@shared/automation/nodes/actions/entity/spawn_at_player/meta'
import { handler as spawnAtPlayerHandler } from '@shared/automation/nodes/actions/entity/spawn_at_player/exec'
import { meta as spawnPrefabMeta } from '@shared/automation/nodes/actions/entity/spawn_prefab/meta'
import { handler as spawnPrefabHandler } from '@shared/automation/nodes/actions/entity/spawn_prefab/exec'
import { meta as removeNearPlayerMeta } from '@shared/automation/nodes/actions/entity/remove_near_player/meta'
import { handler as removeNearPlayerHandler } from '@shared/automation/nodes/actions/entity/remove_near_player/exec'
import { meta as removeNearMeta } from '@shared/automation/nodes/actions/entity/remove_near/meta'
import { handler as removeNearHandler } from '@shared/automation/nodes/actions/entity/remove_near/exec'
import { meta as destroyStructureMeta } from '@shared/automation/nodes/actions/entity/destroy_structure/meta'
import { handler as destroyStructureHandler } from '@shared/automation/nodes/actions/entity/destroy_structure/exec'
import { meta as getEntityMeta } from '@shared/automation/nodes/actions/entity/get_entity/meta'
import { handler as getEntityHandler } from '@shared/automation/nodes/actions/entity/get_entity/exec'
import { meta as entitySetHealthMeta } from '@shared/automation/nodes/actions/entity/entity_set_health/meta'
import { handler as entitySetHealthHandler } from '@shared/automation/nodes/actions/entity/entity_set_health/exec'
import { meta as entityKillMeta } from '@shared/automation/nodes/actions/entity/entity_kill/meta'
import { handler as entityKillHandler } from '@shared/automation/nodes/actions/entity/entity_kill/exec'
import { meta as killAreaMeta } from '@shared/automation/nodes/actions/entity/kill_area/meta'
import { handler as killAreaHandler } from '@shared/automation/nodes/actions/entity/kill_area/exec'
import { meta as entityExtinguishMeta } from '@shared/automation/nodes/actions/entity/entity_extinguish/meta'
import { handler as entityExtinguishHandler } from '@shared/automation/nodes/actions/entity/entity_extinguish/exec'
import { meta as entityIgniteMeta } from '@shared/automation/nodes/actions/entity/entity_ignite/meta'
import { handler as entityIgniteHandler } from '@shared/automation/nodes/actions/entity/entity_ignite/exec'
import { meta as entitySetFuelMeta } from '@shared/automation/nodes/actions/entity/entity_set_fuel/meta'
import { handler as entitySetFuelHandler } from '@shared/automation/nodes/actions/entity/entity_set_fuel/exec'
import { meta as entityFreezeMeta } from '@shared/automation/nodes/actions/entity/entity_freeze/meta'
import { handler as entityFreezeHandler } from '@shared/automation/nodes/actions/entity/entity_freeze/exec'
import { meta as entityUnfreezeMeta } from '@shared/automation/nodes/actions/entity/entity_unfreeze/meta'
import { handler as entityUnfreezeHandler } from '@shared/automation/nodes/actions/entity/entity_unfreeze/exec'
import { meta as uiNotificationMeta } from '@shared/automation/nodes/actions/interface/ui_notification/meta'
import { handler as uiNotificationHandler } from '@shared/automation/nodes/actions/interface/ui_notification/exec'
import { meta as uiLabelMeta } from '@shared/automation/nodes/actions/interface/ui_label/meta'
import { handler as uiLabelHandler } from '@shared/automation/nodes/actions/interface/ui_label/exec'
import { meta as uiProgressBarMeta } from '@shared/automation/nodes/actions/interface/ui_progress_bar/meta'
import { handler as uiProgressBarHandler } from '@shared/automation/nodes/actions/interface/ui_progress_bar/exec'
import { meta as uiSetMeta } from '@shared/automation/nodes/actions/interface/ui_set/meta'
import { handler as uiSetHandler } from '@shared/automation/nodes/actions/interface/ui_set/exec'
import { meta as uiDestroyMeta } from '@shared/automation/nodes/actions/interface/ui_destroy/meta'
import { handler as uiDestroyHandler } from '@shared/automation/nodes/actions/interface/ui_destroy/exec'
import { meta as uiClearMeta } from '@shared/automation/nodes/actions/interface/ui_clear/meta'
import { handler as uiClearHandler } from '@shared/automation/nodes/actions/interface/ui_clear/exec'
import { meta as ruleInstallMeta } from '@shared/automation/nodes/actions/rules/rule_install/meta'
import { handler as ruleInstallHandler } from '@shared/automation/nodes/actions/rules/rule_install/exec'
import { meta as ruleUninstallMeta } from '@shared/automation/nodes/actions/rules/rule_uninstall/meta'
import { handler as ruleUninstallHandler } from '@shared/automation/nodes/actions/rules/rule_uninstall/exec'
import { meta as ruleSetStateMeta } from '@shared/automation/nodes/actions/rules/rule_set_state/meta'
import { handler as ruleSetStateHandler } from '@shared/automation/nodes/actions/rules/rule_set_state/exec'
// END GEN-ACTIONS server
import { meta as uiPanelMeta } from '@shared/automation/nodes/ui/builder/ui_panel/meta'
import { handler as uiPanelHandler } from '@shared/automation/nodes/ui/builder/ui_panel/exec'
import { meta as aiAgentMeta } from '@shared/automation/nodes/ai/agent/ai_agent/meta'
import { handler as aiAgentHandler } from '@shared/automation/nodes/ai/agent/ai_agent/exec'
import { meta as uiMenuMeta } from '@shared/automation/nodes/ui/interactive/ui_menu/meta'
import { handler as uiMenuHandler } from '@shared/automation/nodes/ui/interactive/ui_menu/exec'
import { meta as uiRuleMeta } from '@shared/automation/nodes/ui/interactive/ui_rule/meta'
import { handler as uiRuleHandler } from '@shared/automation/nodes/ui/interactive/ui_rule/exec'

// No-exec metas: triggers (entry points matched in evaluateEvent) and wait (its
// stateful execution lives in the orchestrator, not a handler). Kept for the
// FlowAnalyzer isTrigger/pausable flags.
import { meta as triggerMeta } from '@shared/automation/nodes/triggers/game/trigger/meta'
import { meta as webhookMeta } from '@shared/automation/nodes/triggers/net/webhook/meta'
import { meta as waitMeta } from '@shared/automation/nodes/logic/merge/wait/meta'

export interface BackendNodeEntry {
  meta: NodeMeta
  handler: NodeHandler
}

// ── Registered node modules (one entry per migrated node) ──
const ENTRIES: BackendNodeEntry[] = [
  { meta: delayMeta, handler: delayHandler },
  { meta: setVarMeta, handler: setVarHandler },
  { meta: getPlayerMeta, handler: getPlayerHandler },
  { meta: getServerInfoMeta, handler: getServerInfoHandler },
  { meta: getInventoryMeta, handler: getInventoryHandler },
  { meta: getBuffsMeta, handler: getBuffsHandler },
  { meta: listAllPlayersMeta, handler: listAllPlayersHandler },
  { meta: findPlayerMeta, handler: findPlayerHandler },
  { meta: playerStateMeta, handler: playerStateHandler },
  { meta: callComponentMeta, handler: callComponentHandler },
  { meta: landClaimMeta, handler: landClaimHandler },
  { meta: memoryMeta, handler: memoryHandler },
  { meta: listFlowsMeta, handler: listFlowsHandler },
  { meta: httpMeta, handler: httpHandler },
  { meta: scriptMeta, handler: scriptHandler },
  { meta: uiBuilderMeta, handler: uiBuilderHandler },
  { meta: conditionMeta, handler: conditionHandler },
  { meta: switchMeta, handler: switchHandler },
  { meta: foreachMeta, handler: foreachHandler },
  { meta: loopMeta, handler: loopHandler },
  { meta: breakMeta, handler: breakHandler },
  { meta: editVarMeta, handler: editVarHandler },
  { meta: aggregateMeta, handler: aggregateHandler },
  { meta: datetimeMeta, handler: datetimeHandler },
  { meta: tryCatchMeta, handler: tryCatchHandler },
  { meta: filterMeta, handler: filterHandler },
  { meta: logMeta, handler: logHandler },
  { meta: randomMeta, handler: randomHandler },
  { meta: transformMeta, handler: transformHandler },
  { meta: splitMeta, handler: splitHandler },
  { meta: actionMeta, handler: actionHandler },
  { meta: teleportMeta, handler: teleportHandler },
  { meta: healMeta, handler: healHandler },
  { meta: kickMeta, handler: kickHandler },
  { meta: killMeta, handler: killHandler },
  { meta: respawnMeta, handler: respawnHandler },
  { meta: giveItemMeta, handler: giveItemHandler },
  // BEGIN GEN-ACTIONS entries
  { meta: announceMeta, handler: announceHandler },
  { meta: privateMessageMeta, handler: privateMessageHandler },
  { meta: chatSendMeta, handler: chatSendHandler },
  { meta: feedMeta, handler: feedHandler },
  { meta: restoreSanityMeta, handler: restoreSanityHandler },
  { meta: godmodeMeta, handler: godmodeHandler },
  { meta: teleportToPlayerMeta, handler: teleportToPlayerHandler },
  { meta: setSeasonMeta, handler: setSeasonHandler },
  { meta: setPhaseMeta, handler: setPhaseHandler },
  { meta: skipDayMeta, handler: skipDayHandler },
  { meta: setRainMeta, handler: setRainHandler },
  { meta: stopRainMeta, handler: stopRainHandler },
  { meta: pauseMeta, handler: pauseHandler },
  { meta: unpauseMeta, handler: unpauseHandler },
  { meta: setSpeedMeta, handler: setSpeedHandler },
  { meta: rollbackMeta, handler: rollbackHandler },
  { meta: executeMeta, handler: executeHandler },
  { meta: banMeta, handler: banHandler },
  { meta: lightningMeta, handler: lightningHandler },
  { meta: regenerateMeta, handler: regenerateHandler },
  { meta: setNextPhaseMeta, handler: setNextPhaseHandler },
  { meta: setSnowMeta, handler: setSnowHandler },
  { meta: setDayLengthMeta, handler: setDayLengthHandler },
  { meta: setSeasonLengthMeta, handler: setSeasonLengthHandler },
  { meta: removeInventoryMeta, handler: removeInventoryHandler },
  { meta: removeItemMeta, handler: removeItemHandler },
  { meta: countItemMeta, handler: countItemHandler },
  { meta: hasItemMeta, handler: hasItemHandler },
  { meta: equipItemMeta, handler: equipItemHandler },
  { meta: unequipMeta, handler: unequipHandler },
  { meta: dropItemMeta, handler: dropItemHandler },
  { meta: clearInventoryMeta, handler: clearInventoryHandler },
  { meta: transferItemMeta, handler: transferItemHandler },
  { meta: dumpInventoryMeta, handler: dumpInventoryHandler },
  { meta: uiTrackMeta, handler: uiTrackHandler },
  { meta: spawnAtPlayerMeta, handler: spawnAtPlayerHandler },
  { meta: spawnPrefabMeta, handler: spawnPrefabHandler },
  { meta: removeNearPlayerMeta, handler: removeNearPlayerHandler },
  { meta: removeNearMeta, handler: removeNearHandler },
  { meta: destroyStructureMeta, handler: destroyStructureHandler },
  { meta: getEntityMeta, handler: getEntityHandler },
  { meta: entitySetHealthMeta, handler: entitySetHealthHandler },
  { meta: entityKillMeta, handler: entityKillHandler },
  { meta: killAreaMeta, handler: killAreaHandler },
  { meta: entityExtinguishMeta, handler: entityExtinguishHandler },
  { meta: entityIgniteMeta, handler: entityIgniteHandler },
  { meta: entitySetFuelMeta, handler: entitySetFuelHandler },
  { meta: entityFreezeMeta, handler: entityFreezeHandler },
  { meta: entityUnfreezeMeta, handler: entityUnfreezeHandler },
  { meta: uiNotificationMeta, handler: uiNotificationHandler },
  { meta: uiLabelMeta, handler: uiLabelHandler },
  { meta: uiProgressBarMeta, handler: uiProgressBarHandler },
  { meta: uiSetMeta, handler: uiSetHandler },
  { meta: uiDestroyMeta, handler: uiDestroyHandler },
  { meta: uiClearMeta, handler: uiClearHandler },
  { meta: ruleInstallMeta, handler: ruleInstallHandler },
  { meta: ruleUninstallMeta, handler: ruleUninstallHandler },
  { meta: ruleSetStateMeta, handler: ruleSetStateHandler },
  // END GEN-ACTIONS entries
  { meta: uiPanelMeta, handler: uiPanelHandler },
  { meta: aiAgentMeta, handler: aiAgentHandler },
  { meta: uiMenuMeta, handler: uiMenuHandler },
  { meta: uiRuleMeta, handler: uiRuleHandler },
]

// No-handler metas (triggers + wait), kept apart from the dispatch ENTRIES.
const NO_EXEC_METAS: NodeMeta[] = [triggerMeta, webhookMeta, waitMeta]

const registry = new Map<string, BackendNodeEntry>(ENTRIES.map(e => [e.meta.type, e]))

/** Lookup a migrated node by type. Returns undefined for legacy/unmigrated nodes. */
export function getNodeEntry(type: string): BackendNodeEntry | undefined {
  return registry.get(type)
}

/** All node metas incl. triggers/wait (for FlowAnalyzer trigger/pausable flags). */
export function allNodeMetas(): NodeMeta[] {
  return [...ENTRIES.map(e => e.meta), ...NO_EXEC_METAS]
}
