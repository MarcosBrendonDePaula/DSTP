-- DSTP Events — all the DST event listeners that the mod re-emits as DSTP events.
-- Per-player (combat/crafting/inventory/health/...), world (day/season/phase/...),
-- weather, boss and grief listeners. Each callback gates on core.evt_config so a
-- category can be hot-toggled without re-registering. Extracted from client.lua;
-- the bodies are UNCHANGED — local aliases below map to core. Writes
-- core.hooked_players/world_inst. RegisterGameEvents(core, inst) is the entry point.

local Events = {}

-- Forward-declarations: these reference each other (RegisterGameEvents calls the
-- rest; RegisterPlayerEvents calls RegisterPerPlayerEvents), so declare before use.
local RegisterPerPlayerEvents
local RegisterPlayerEvents
local RegisterWorldEvents
local RegisterWeatherEvents
local RegisterBossEvents
local RegisterGriefEvents
local RegisterGameEvents

-- core aliases (set in Init, used by the bodies). These are upvalues captured at
-- Init time; _G/config/evt_config are stable by then.
local core, _G, config, evt_config, hooked_players, FindPlayer, Log
-- DSTP proxy so bodies' DSTP.PushEvent/_DEBUG keep working, read from core.
local DSTP
local world_inst  -- module-local mirror; also synced to core.world_inst in RegisterGameEvents
-- owner-setup notifier comes from core (set when chat helpers init).
local function MaybeNotifyOwnerSetup(player)
    if core.MaybeNotifyOwnerSetup then core.MaybeNotifyOwnerSetup(player) end
end

RegisterPerPlayerEvents = function(player)
    if not player then return end
    local uid = player.userid or ""
    -- Skip if no userid yet or already hooked
    if uid == "" then
        -- Retry up to 5 times (0.5s intervals) until userid is populated
        if _G.TheWorld and not player._dstp_hook_retries then
            player._dstp_hook_retries = 0
        end
        if _G.TheWorld and (player._dstp_hook_retries or 0) < 5 then
            player._dstp_hook_retries = (player._dstp_hook_retries or 0) + 1
            _G.TheWorld:DoTaskInTime(0.5, function()
                if player:IsValid() and player.userid and player.userid ~= "" then
                    RegisterPerPlayerEvents(player)
                else
                    RegisterPerPlayerEvents(player) -- will retry again
                end
            end)
        else
            LogInfo("WARNING: Could not hook player events - userid still empty after retries")
        end
        return
    end
    if hooked_players[uid] then return end
    hooked_players[uid] = true

    local pname = player.name or "unknown"

    -- players
    player:ListenForEvent("ms_becameghost", function(inst)
        if not evt_config.players then return end
        DSTP.PushEvent("player_ghost", { userid = inst.userid or uid, name = inst.name or pname, prefab = inst.prefab or "" })
    end)

    player:ListenForEvent("ms_respawnedfromghost", function(inst)
        if not evt_config.players then return end
        DSTP.PushEvent("player_respawn", { userid = inst.userid or uid, name = inst.name or pname, prefab = inst.prefab or "" })
    end)

    -- combat
    player:ListenForEvent("killed", function(inst, data)
        if not evt_config.combat then return end
        DSTP.PushEvent("player_kill", {
            userid = uid, name = pname,
            victim = data and data.victim and data.victim.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("attacked", function(inst, data)
        if not evt_config.combat then return end
        DSTP.PushEvent("player_attacked", {
            userid = uid, name = pname,
            attacker = data and data.attacker and data.attacker.prefab or "unknown",
            damage = data and data.damage or 0,
            damage_resolved = data and data.damageresolved or 0,
            weapon = data and data.weapon and data.weapon.prefab or nil,
            stimuli = data and data.stimuli or nil,
        }, data)
    end)

    -- crafting
    player:ListenForEvent("builditem", function(inst, data)
        if not evt_config.crafting then return end
        DSTP.PushEvent("player_craft", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            recipe = data and data.recipe and data.recipe.name or "unknown",
        }, data)
    end)

    player:ListenForEvent("buildstructure", function(inst, data)
        if not evt_config.crafting then return end
        DSTP.PushEvent("player_build", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            recipe = data and data.recipe and data.recipe.name or "unknown",
        }, data)
    end)

    -- inventory
    player:ListenForEvent("equip", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_equip", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            slot = data and data.eslot or "unknown",
        }, data)
    end)

    player:ListenForEvent("onpickupitem", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_pickup", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("dropitem", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_drop", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("unequip", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_unequip", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            slot = data and data.eslot or "unknown",
        }, data)
    end)

    -- health
    player:ListenForEvent("healthdelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("health_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
            cause = data and (type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab)) or nil,
            afflicter = data and data.afflicter and data.afflicter.prefab or nil,
        }, data)
    end)

    player:ListenForEvent("hungerdelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("hunger_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
        }, data)
    end)

    player:ListenForEvent("sanitydelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("sanity_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
        }, data)
    end)

    -- survival
    player:ListenForEvent("oneat", function(inst, data)
        if not evt_config.survival then return end
        local food = data and data.food
        local edible = food and food.components and food.components.edible
        DSTP.PushEvent("player_eat", {
            userid = uid, name = pname,
            food = food and food.prefab or "unknown",
            health = edible and edible.healthvalue or 0,
            hunger = edible and edible.hungervalue or 0,
            sanity = edible and edible.sanityvalue or 0,
        }, data)
    end)

    player:ListenForEvent("goinsane", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_insane", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("gosane", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_sane", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("startstarving", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_starving", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopstarving", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_fed", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("startfreezing", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_freezing", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopfreezing", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_warm", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("startoverheating", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_overheating", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopoverheating", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_cooled", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("mounted", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_mounted", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("dismounted", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_dismounted", { userid = uid, name = pname }, inst)
    end)

    -- gathering
    -- Player finished breaking something (chop tree, mine rock, hammer structure)
    player:ListenForEvent("finishedwork", function(inst, data)
        if not evt_config.gathering then return end
        local target = data and data.target
        if not target then return end
        local action = data.action and tostring(data.action) or "unknown"

        DSTP.PushEvent("player_work", {
            userid = uid, name = pname,
            target = target.prefab or "unknown",
            action = action,
        }, data)

        -- Hook loot drops from the destroyed entity
        if target:IsValid() and target.components and target.components.lootdropper then
            target:ListenForEvent("loot_prefab_spawned", function(ent, lootdata)
                if lootdata and lootdata.loot then
                    local count = 1
                    if lootdata.loot.components and lootdata.loot.components.stackable then
                        count = lootdata.loot.components.stackable:StackSize()
                    end
                    DSTP.PushEvent("resource_gathered", {
                        userid = uid, name = pname,
                        source = target.prefab or "unknown",
                        action = action,
                        loot = lootdata.loot.prefab or "unknown",
                        count = count,
                    }, lootdata)
                end
            end)
        end
    end)

    -- Player harvested something (berry bush, farm plant, etc)
    player:ListenForEvent("harvestsomething", function(inst, data)
        if not evt_config.gathering then return end
        local obj = data and data.object
        DSTP.PushEvent("player_harvest", {
            userid = uid, name = pname,
            source = obj and obj.prefab or "unknown",
        }, data)
    end)

    -- Player STARTED a long action (e.g. harvesting/picking). Fires at the start,
    -- before the action completes — the "began" event that gathering otherwise
    -- lacks (player_harvest fires only on completion).
    player:ListenForEvent("startlongaction", function(inst, data)
        if not evt_config.gathering then return end
        DSTP.PushEvent("player_action_start", {
            userid = uid, name = pname,
        }, data)
    end)

    -- Player started a fire
    player:ListenForEvent("onstartedfire", function(inst, data)
        if not evt_config.gathering then return end
        DSTP.PushEvent("player_startfire", {
            userid = uid, name = pname,
            target = data and data.target and data.target.prefab or "unknown",
        }, data)
    end)

    -- world interactions
    -- Player entered a wormhole
    player:ListenForEvent("onwenthome", function(inst)
        if not evt_config.world then return end
        DSTP.PushEvent("player_teleported", {
            userid = uid, name = pname,
            type = "wormhole_enter",
        })
    end)

    -- Player left a wormhole / teleport
    player:ListenForEvent("onleftplayer", function(inst)
        if not evt_config.world then return end
        DSTP.PushEvent("player_teleported", {
            userid = uid, name = pname,
            type = "wormhole_exit",
        })
    end)

    -- exploration
    player:ListenForEvent("onsink", function(inst, data)
        if not evt_config.exploration then return end
        local x, _, z = 0, 0, 0
        if inst.Transform then x, _, z = inst.Transform:GetWorldPosition() end
        DSTP.PushEvent("player_sunk", {
            userid = uid, name = pname,
            x = math.floor(x), z = math.floor(z),
        }, data)
    end)

    player:ListenForEvent("fishingcollect", function(inst, data)
        if not evt_config.exploration then return end
        local fish = data and data.fish
        DSTP.PushEvent("fish_caught", {
            userid = uid, name = pname,
            fish = fish and fish.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onboat", function(inst)
        if not evt_config.exploration then return end
        DSTP.PushEvent("boat_entered", { userid = uid, name = pname })
    end)

    player:ListenForEvent("onboatoff", function(inst)
        if not evt_config.exploration then return end
        DSTP.PushEvent("boat_exited", { userid = uid, name = pname })
    end)

    -- griefing: container open/close and hammer
    player:ListenForEvent("onopencontainer", function(inst, data)
        if not evt_config.griefing then return end
        local c = data and data.container
        DSTP.PushEvent("container_opened", {
            userid = uid, name = pname,
            container_prefab = c and c.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onclosecontainer", function(inst, data)
        if not evt_config.griefing then return end
        local c = data and data.container
        DSTP.PushEvent("container_closed", {
            userid = uid, name = pname,
            container_prefab = c and c.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onhammer", function(inst, data)
        if not evt_config.griefing then return end
        local target = data and data.target
        if not target then return end
        DSTP.PushEvent("structure_hammered", {
            userid = uid, name = pname,
            prefab = target.prefab or "unknown",
        }, data)
    end)

    -- character-specific events
    -- Player learned a new cookbook recipe (fires when they eat something new)
    player:ListenForEvent("learncookbookrecipe", function(inst, data)
        if not evt_config.character then return end
        DSTP.PushEvent("recipe_learned", {
            userid = uid, name = pname,
            product = data and data.product or "unknown",
        }, data)
    end)

    -- Wickerbottom (or any character) read a book
    player:ListenForEvent("readbook", function(inst, data)
        if not evt_config.character then return end
        DSTP.PushEvent("book_read", {
            userid = uid, name = pname,
            book = data and data.book and data.book.prefab or "unknown",
        }, data)
    end)

    -- Woodie / Wurt / etc. transformed into were-form
    player:ListenForEvent("transformwere", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("character_transform", {
            userid = uid, name = pname,
            form = "were",
        })
    end)

    -- Transformed back to normal form
    player:ListenForEvent("transformnormal", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("character_transform", {
            userid = uid, name = pname,
            form = "normal",
        })
    end)

    -- Player went to sleep (tent, siesta, bedroll)
    player:ListenForEvent("gotosleep", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("player_sleep_start", { userid = uid, name = pname })
    end)

    -- Player woke up
    player:ListenForEvent("onwakeup", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("player_sleep_end", { userid = uid, name = pname })
    end)

    -- ── Combat / anti-grief: player attacking OTHER entities ───────────────
    -- The local client only sees its own player's attacks. attackother fires
    -- when this player swings at a target; useful to detect grief/PvP.
    player:ListenForEvent("onattackother", function(inst, data)
        if not evt_config.combat then return end
        local target = data and data.target
        DSTP.PushEvent("player_attack_other", {
            userid = uid, name = pname,
            target = target and target.prefab or "unknown",
            target_guid = target and target.GUID or nil,
            target_is_player = target and target:HasTag("player") or false,
            weapon = data and data.weapon and data.weapon.prefab or nil,
        }, data)
    end)

    -- Player landed a hit on another entity (resolved damage).
    player:ListenForEvent("onhitother", function(inst, data)
        if not evt_config.combat then return end
        local target = data and data.target
        DSTP.PushEvent("player_hit_other", {
            userid = uid, name = pname,
            target = target and target.prefab or "unknown",
            target_guid = target and target.GUID or nil,  -- p/ HUD seguir o alvo exato
            target_is_player = target and target:HasTag("player") or false,
            damage = data and data.damage or 0,
        }, data)
    end)

    -- ── Danger states ──────────────────────────────────────────────────────
    -- Player started taking fire damage (on fire).
    player:ListenForEvent("startfiredamage", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_on_fire", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopfiredamage", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_fire_out", { userid = uid, name = pname }, inst)
    end)

    -- Player received an item into the inventory (gift, pickup, crafting...).
    player:ListenForEvent("itemget", function(inst, data)
        if not evt_config.inventory then return end
        local item = data and data.item
        DSTP.PushEvent("player_item_get", {
            userid = uid, name = pname,
            prefab = item and item.prefab or "unknown",
            slot = data and data.slot or nil,
        }, data)
    end)
end

RegisterPlayerEvents = function(inst)
    inst:ListenForEvent("ms_playerspawn", function(world, player)
        -- Always hook per-player events, even if players category is disabled
        inst:DoTaskInTime(0, function()
            if not player:IsValid() then return end
            RegisterPerPlayerEvents(player)
            -- First-run: nudge the owner to set up the panel (once). Small delay
            -- so the client table (admin flag) is populated.
            inst:DoTaskInTime(2, function() MaybeNotifyOwnerSetup(player) end)
            if not evt_config.players then return end
            DSTP.PushEvent("player_spawn", {
                userid = player.userid,
                name = player.name,
                prefab = player.prefab,
            }, player)
        end)
    end)

    inst:ListenForEvent("ms_playerleft", function(world, player)
        hooked_players[player.userid] = nil
        if not evt_config.players then return end
        DSTP.PushEvent("player_left", {
            userid = player.userid,
            name = player.name,
        }, player)
    end)

    inst:ListenForEvent("ms_playerdisconnected", function(world, data)
        if not evt_config.players then return end
        local p = data and data.player
        DSTP.PushEvent("player_disconnected", {
            userid = p and p.userid or (data and data.userid) or "unknown",
            name = p and p.name or (data and data.name) or "unknown",
            reason = data and data.reason or "disconnect",
        }, data)
    end)

    inst:ListenForEvent("entity_death", function(world, data)
        if not evt_config.players then return end
        if data and data.inst and data.inst:HasTag("player") then
            DSTP.PushEvent("player_death", {
                userid = data.inst.userid,
                name = data.inst.name,
                cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "unknown",
            }, data)
        end
    end)
end

RegisterWorldEvents = function(inst)
    inst:ListenForEvent("ms_cyclecomplete", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("new_day", { day = world.state.cycles }, world)
    end)

    -- Day phase (day/dusk/night). Listen to the REAL notification `phasechanged`
    -- (clock.lua:396 pushes it with the phase name on a NATURAL transition), not the
    -- `ms_nextphase` COMMAND event — that only fires when the phase is forced, so
    -- natural day/dusk/night cycling was being missed.
    inst:ListenForEvent("phasechanged", function(world, phase)
        if not evt_config.world then return end
        DSTP.PushEvent("phase_changed", { phase = phase or world.state.phase }, world)
    end)

    -- Season. `seasontick` fires every tick with the current season name; emit
    -- season_changed only when it actually CHANGES (compare to the last one we saw,
    -- mirroring the moonphase pattern). `ms_setseason` was the force-command, so
    -- natural season rollover never fired.
    inst:ListenForEvent("seasontick", function(world, data)
        if not evt_config.world then return end
        local season = (data and data.season) or (world.state and world.state.season)
        if season and inst._dstp_last_season ~= season then
            inst._dstp_last_season = season
            DSTP.PushEvent("season_changed", { season = tostring(season) }, data)
        end
    end)

    inst:ListenForEvent("ms_sendlightningstrike", function(world, pt)
        if not evt_config.weather then return end
        DSTP.PushEvent("lightning_strike", {
            x = pt and pt.x and math.floor(pt.x) or 0,
            z = pt and pt.z and math.floor(pt.z) or 0,
        }, pt)
    end)

    -- Moon phase changed (fires when phase actually changes naturally)
    -- Also listen to ms_setmoonphase for manual/console changes
    local function OnMoonPhase(world, data)
        if not evt_config.world then return end
        local phase = (data and data.moonphase)
            or (data and type(data) == "string" and data)
            or (world.state and world.state.moonphase)
            or "unknown"
        DSTP.PushEvent("moon_phase_changed", {
            phase = tostring(phase),
            is_new = tostring(phase) == "new",
            is_full = tostring(phase) == "full",
        }, data)
    end
    inst:ListenForEvent("moonphasechanged", OnMoonPhase)
    inst:ListenForEvent("ms_setmoonphase", OnMoonPhase)
    -- Fallback: also listen to nightmarephase (triggered each phase transition)
    inst:ListenForEvent("phasechanged", function(world, phase)
        -- Check if moon phase actually changed
        if not evt_config.world then return end
        if world.state and world.state.moonphase and inst._last_moonphase ~= world.state.moonphase then
            local prev = inst._last_moonphase
            inst._last_moonphase = world.state.moonphase
            if prev ~= nil then
                DSTP.PushEvent("moon_phase_changed", {
                    phase = tostring(world.state.moonphase),
                    is_new = tostring(world.state.moonphase) == "new",
                    is_full = tostring(world.state.moonphase) == "full",
                })
            end
        end
    end)

    -- Earthquake started (caves only typically)
    inst:ListenForEvent("ms_earthquake", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("earthquake", {
            shard_type = config.shard_type,
        })
    end)

    -- Sinkhole warning
    inst:ListenForEvent("ms_sinkhole_warn", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("sinkhole_warn", {
            shard_type = config.shard_type,
        })
    end)

    -- World save triggered
    inst:ListenForEvent("ms_save", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("world_save", {})
    end)

    -- Hound attack warning (houndwarningsound fires when hounds are about to attack)
    -- This is on the hounded component of TheWorld
    inst:ListenForEvent("houndwarningsound", function(world)
        if not evt_config.bosses then return end
        DSTP.PushEvent("hound_warning", {
            shard_type = config.shard_type,
        })
    end)

    -- Hound attack begins (when hounds actually spawn)
    inst:ListenForEvent("ms_houndattack", function(world)
        if not evt_config.bosses then return end
        DSTP.PushEvent("hound_attack", {
            shard_type = config.shard_type,
        })
    end)
end

RegisterWeatherEvents = function(inst)
    inst:ListenForEvent("ms_stormchanged", function(world, data)
        if not evt_config.weather then return end
        DSTP.PushEvent("storm_changed", {
            stormtype = data and data.stormtype or "unknown",
            setting = data and data.setting,
        }, data)
    end)

    -- Precipitation. Listen to the REAL `precipitationchanged` (weather.lua:778
    -- pushes it with the precip-type name — "none"/"rain"/"snow" — when rain
    -- naturally starts/stops), not the `ms_forceprecipitation` COMMAND event.
    inst:ListenForEvent("precipitationchanged", function(world, ptype)
        if not evt_config.weather then return end
        DSTP.PushEvent("precipitation", {
            type = ptype,
            enabled = ptype ~= nil and ptype ~= "none",
        }, ptype)
    end)
end

RegisterBossEvents = function(inst)
    local boss_events = {
        "ms_moonboss_was_defeated",
        "ms_lordfruitflykilled",
    }
    for _, evt in ipairs(boss_events) do
        inst:ListenForEvent(evt, function(world, data)
            if not evt_config.bosses then return end
            DSTP.PushEvent("boss_event", { event = evt, data = data }, data)
        end)
    end

    inst:ListenForEvent("entity_death", function(world, data)
        if not evt_config.bosses then return end
        if data and data.inst and not data.inst:HasTag("player") then
            local prefab = data.inst.prefab
            -- Only track notable mobs
            local notable = {
                deerclops = true, bearger = true, moose = true, dragonfly = true,
                antlion = true, beequeen = true, klaus = true, toadstool = true,
                minotaur = true, stalker_atrium = true, alterguardian_phase3 = true,
                crabking = true, malbatross = true, lordfruitfly = true,
                shadowchesspieces = true, nightmare_werepig = true,
            }
            if notable[prefab] then
                DSTP.PushEvent("boss_killed", {
                    prefab = prefab,
                    cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "unknown",
                }, data)
            end
        end
    end)

    -- Fire detection (griefing)
    inst:ListenForEvent("ms_registerfire", function(world, data)
        if not evt_config.bosses then return end
        local fire = data
        if fire then
            local x, _, z = 0, 0, 0
            if fire.Transform then
                x, _, z = fire.Transform:GetWorldPosition()
            end
            DSTP.PushEvent("fire_started", {
                prefab = fire.prefab or "unknown",
                x = math.floor(x),
                z = math.floor(z),
            }, fire)
        end
    end)
end

-- Anti-grief detection: structure_burnt via entity_death + burnable check
RegisterGriefEvents = function(inst)
    inst:ListenForEvent("entity_death", function(world, data)
        if not evt_config.griefing then return end
        local ent = data and data.inst
        if not ent then return end
        -- Only report structures
        if not (ent:HasTag("structure") or (ent.components and ent.components.workable)) then return end
        -- Was it burnt?
        local was_burnt = ent.components and ent.components.burnable and ent.components.burnable.burning
        local is_fire_cause = data.cause == "fire"
            or (data.afflicter and data.afflicter.HasTag and data.afflicter:HasTag("fire"))
        if was_burnt or is_fire_cause then
            local x, _, z = 0, 0, 0
            if ent.Transform then x, _, z = ent.Transform:GetWorldPosition() end
            DSTP.PushEvent("structure_burnt", {
                prefab = ent.prefab or "unknown",
                cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "fire",
                x = math.floor(x),
                z = math.floor(z),
            }, data)
        end
    end)
end

RegisterGameEvents = function(inst)
    world_inst = inst

    -- Register ALL listeners unconditionally
    -- Each callback checks evt_config at runtime, so categories can be toggled without re-registering
    RegisterPlayerEvents(inst)
    RegisterWorldEvents(inst)
    RegisterWeatherEvents(inst)
    RegisterBossEvents(inst)
    RegisterGriefEvents(inst)

    -- Hook per-player events for existing players
    for _, player in ipairs(_G.AllPlayers) do
        RegisterPerPlayerEvents(player)
    end

    local enabled = {}
    for k, v in pairs(evt_config) do
        if v then table.insert(enabled, k) end
    end
    if DSTP._DEBUG then Log("Event categories: " .. table.concat(enabled, ", ")) end
end

function Events.Init(c)
    core = c
    _G = c._G
    config = c.config
    evt_config = c.evt_config
    hooked_players = c.hooked_players
    FindPlayer = c.FindPlayer
    Log = c.Log
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "RegisterCommand" then return core.RegisterCommand end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    return Events
end

-- Public entry: register every listener on the world inst.
function Events.RegisterGameEvents(inst)
    core.world_inst = inst  -- share the world inst with core
    return RegisterGameEvents(inst)
end

-- RegisterPerPlayerEvents is also called from DSTP.Init for already-connected
-- players; expose it so the client can drive that without re-importing internals.
function Events.RegisterPerPlayerEvents(player)
    return RegisterPerPlayerEvents(player)
end

return Events
