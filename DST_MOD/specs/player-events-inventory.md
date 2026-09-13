# Player events — what the game emits vs what the mod captures

Survey 2026-09-12 of every `PushEvent("…")` in `prefabs/player_common.lua` +
`components/*.lua` (from `data/databundles/scripts.zip`). ~500 distinct names. This
page keeps the ones a flow author could want, marked ✅ captured (our event name) /
🟡 partly / ⬜ not yet. Rule stays: add a listener only when a concrete flow consumes it.

## The generic one: `player_action` (category `interaction`) ✅
`performaction` fires for EVERY BufferedAction the player runs — one listener covers
examine (`LOOK`), pick up, attack, open, harvest, chop/mine, give, eat, equip, deploy,
build, fish, ride, … with the SERVER guid of the target. `actionfailed` →
`player_action_failed { reason }`. Ground `WALKTO` (no target) is dropped as noise.
Payload: `{ userid, name, action, guid, prefab, x, z, target_userid, item, item_guid, recipe }`.
Most "⬜ interaction-ish" rows below are already reachable through it by filtering
`{{trigger.action}}`; a dedicated event only pays off when it carries data the
BufferedAction lacks (amounts, results).

## Inventory by area

| Vanilla event | Status | Ours / note |
|---------------|--------|-------------|
| `death`, `respawnfromghost`, `respawnfromcorpse`, `ms_playerjoined/left` | ✅ | players: player_death / player_respawn / player_spawn / player_left |
| `attacked`, `onattackother`, `killed` | ✅ | combat: player_attacked / player_kill |
| `healthdelta`, `hungerdelta`, `sanitydelta` | ✅ | health (debounced) |
| `startstarving/stopstarving`, `goinsane/gosane`, `startfreezing/stopfreezing`, `startoverheating/stopoverheating`, `mounted/dismounted`, `oneat` | ✅ | survival |
| `equip/unequip`, `itemget/itemlose`, `dropitem`, `inventoryfull`, `trade` | ✅ | inventory (+ inventory_full, trade_received) |
| `finishedwork`, `harvestsomething`, `picksomething`, `onstartedfire`, `working` | ✅ | gathering |
| `builditem`, `buildstructure`, `unlockrecipe`, `techtreechange` | ✅ | crafting |
| `performaction`, `actionfailed` | ✅ | **interaction: player_action / player_action_failed** |
| `moisturedelta`, `wetnesschange` | 🟡 | survival has player_wet (edge); no per-delta stream |
| `temperaturedelta` | ⬜ | per-tick; only worth it debounced like health |
| `startaction` | ⬜ | action STARTED (long actions: chop/mine/fish begin) — pair with performaction if a flow needs "began X" |
| `gotnewitem`, `stacksizechange`, `percentusedchange` | ⬜ | item-level detail; `player_pickup` covers the common case |
| `fishingcatch`, `fishingnibble`, `fishingcancel`, `fishingcollect` | ⬜ | fishing minigame — `player_action FISH/…` gives start/finish; catch details need these |
| `domesticated`, `obediencedelta`, `domesticationdelta`, `saddlechanged` | 🟡 | creatures: beefalo_tamed/feral; deltas not streamed |
| `onreachdestination` | ⬜ | locomotor arrival — the flow brain has its own `brain_arrived` |
| `newcombattarget`, `droppedtarget`, `losttarget`, `giveuptarget` | 🟡 | streamed for flow-brained mobs (`brain_target_*`); not for players |
| `haunted` (ghost haunts X) | ⬜ | good grief/fun signal: who haunted what |
| `gotosleep`, `onwakeup`, `rest`, `endrest` | ✅ | character: player_sleep_start/end |
| `transformwere`, `transformnormal`, `werenessdelta` | ✅/🟡 | character_transform; wereness delta not streamed |
| `teleported`, `changearea`, `onsink`, `got_on_platform/got_off_platform` | 🟡 | exploration: player_teleported; boat boarding not yet |
| `boat_start_moving/stop_moving`, `start_steering_boat`, `anchor_raised/lowered` | ⬜ | boat life — nothing yet |
| `playervotechanged` | ⬜ | vote UI — could drive a custom vote flow |
| `unlockrecipe` / `newskillpointupdated` / `onactivateskill_server` | 🟡 | recipe_unlocked; skill tree not yet |
| `sizetweener_*`, `colourtweener_*`, `clientpet*dirty`, `*vision`, `ccoverrides` | — | cosmetic/replication plumbing, not events for flows |

## Candidates worth a dedicated event (data the BufferedAction lacks)
1. `startaction` → `player_action_start` (long actions; "began chopping").
2. `fishingcatch` → `player_fish { fish prefab, weight }`.
3. `haunted` → `ghost_haunted { target guid/prefab }`.
4. `got_on_platform/got_off_platform`, `boat_start_moving` → `player_boat_*`.
5. `temperaturedelta` debounced → `temperature_delta` (parallel to health).
