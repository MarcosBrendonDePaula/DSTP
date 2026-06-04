-- DSTP Commands — the ~55 backend-driven command handlers (heal/kick/give_item/
-- ui_command/claim_*/execute/...). Extracted from client.lua; the handler bodies are
-- UNCHANGED. They run via core.RegisterCommand and use core helpers (FindPlayer/
-- PushEvent/SafeEncode/Log) and core._G/config/LandClaims. Local aliases below keep
-- the bodies byte-identical (DSTP.X maps to core.X; FindPlayer/_G/... alias core).
--
-- Mutates only core.config.dump_mode (the set_dump_mode command). RegisterAll(core)
-- is called once from client.lua's DSTP.Init.

local Commands = {}

function Commands.RegisterAll(core)
    -- Aliases so the extracted handler bodies stay unchanged. _G/config are stable
    -- by the time RegisterAll runs (after Core.Init). FindPlayer/SendPrivateMessage/
    -- Log/LogError/SafeEncode are stable function refs on core.
    local _G = core._G
    local config = core.config
    local FindPlayer = core.FindPlayer
    local SendPrivateMessage = core.SendPrivateMessage
    local Log = core.Log
    local LogError = core.LogError
    local SafeEncode = core.SafeEncode
    -- DSTP reads from core dynamically (so DSTP._DEBUG reflects later debug toggles).
    local DSTP = setmetatable({}, { __index = function(_, k)
        if k == "RegisterCommand" then return core.RegisterCommand end
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    -- LandClaims is already set on core (DSTP.Init sets it before RegisterAll), so a
    -- plain capture is safe and keeps the claim_* handlers using `LandClaims.Add`.
    local LandClaims = core.LandClaims

    DSTP.RegisterCommand("announce", function(data)
        if data.message then _G.TheNet:Announce(data.message) end
    end)

    DSTP.RegisterCommand("chat_send", function(data)
        if data.message then
            local name = data.name or "[DSTP Admin]"
            _G.TheNet:Announce(name .. ": " .. data.message)
            DSTP.PushEvent("chat_message", {
                userid = "dstp",
                name = name,
                message = data.message,
                prefab = "system",
            })
        end
    end)

    DSTP.RegisterCommand("private_message", function(data)
        if data.userid and data.message then
            local player = FindPlayer(data.userid)
            if player then
                SendPrivateMessage(player, data.message)
            end
        end
    end)

    DSTP.RegisterCommand("kick", function(data)
        if data.userid then _G.TheNet:Kick(data.userid) end
    end)

    DSTP.RegisterCommand("ban", function(data)
        if data.userid then _G.TheNet:Ban(data.userid) end
    end)

    DSTP.RegisterCommand("add_admin", function(data)
        if data.userid then
            _G.TheNet:SetIsClientAdmin(data.userid, true)
            if DSTP._DEBUG then Log("Admin added: " .. tostring(data.userid)) end
        end
    end)

    DSTP.RegisterCommand("remove_admin", function(data)
        if data.userid then
            _G.TheNet:SetIsClientAdmin(data.userid, false)
            if DSTP._DEBUG then Log("Admin removed: " .. tostring(data.userid)) end
        end
    end)

    DSTP.RegisterCommand("kill", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.health then
            player.components.health:Kill()
        end
    end)

    DSTP.RegisterCommand("respawn", function(data)
        if DSTP._DEBUG then Log("Respawn command: userid=" .. tostring(data.userid)) end
        local player = FindPlayer(data.userid)
        if player then
            if DSTP._DEBUG then Log("  Found player: " .. tostring(player.name) .. " ghost=" .. tostring(player:HasTag("playerghost"))) end
            if player:HasTag("playerghost") then
                player:PushEvent("respawnfromghost")
                Log("  Respawned!")
            else
                Log("  Player is NOT a ghost, skipping")
            end
        else
            if DSTP._DEBUG then Log("  Player NOT found for userid: " .. tostring(data.userid)) end
        end
    end)

    DSTP.RegisterCommand("heal", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.health then
            player.components.health:DoDelta(data.amount or player.components.health.maxhealth)
        end
    end)

    DSTP.RegisterCommand("feed", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.hunger then
            player.components.hunger:DoDelta(data.amount or player.components.hunger.max)
        end
    end)

    DSTP.RegisterCommand("restore_sanity", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.sanity then
            player.components.sanity:DoDelta(data.amount or player.components.sanity.max)
        end
    end)

    DSTP.RegisterCommand("godmode", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.health then
            local enable = data.enabled ~= false
            player.components.health:SetInvincible(enable)
            player.components.health.invincible = enable
            if DSTP._DEBUG then Log("Godmode " .. (enable and "ON" or "OFF") .. " for " .. tostring(player.name)) end
        else
            LogError("Godmode: player not found or no health - " .. tostring(data.userid))
        end
    end)

    -- ── Player state control (real components, master sim) ──
    -- Each gates on the component existing, like heal/feed above. Admin gating is
    -- done in the FLOW (backend), not here.

    DSTP.RegisterCommand("set_temperature", function(data)
        local player = FindPlayer(data.userid)
        local v = _G.tonumber(data.value)
        if player and player.components.temperature and v then
            player.components.temperature:SetTemperature(v)
        end
    end)

    DSTP.RegisterCommand("set_moisture", function(data)
        local player = FindPlayer(data.userid)
        local p = _G.tonumber(data.percent)
        if player and player.components.moisture and p then
            player.components.moisture:SetPercent(math.max(0, math.min(1, p)))
        end
    end)

    DSTP.RegisterCommand("ignite", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.burnable then
            player.components.burnable:Ignite()
        end
    end)

    DSTP.RegisterCommand("extinguish", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.burnable then
            player.components.burnable:Extinguish()
        end
    end)

    DSTP.RegisterCommand("freeze", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.freezable then
            player.components.freezable:Freeze(_G.tonumber(data.duration))
        end
    end)

    DSTP.RegisterCommand("unfreeze", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.freezable then
            player.components.freezable:Unfreeze()
        end
    end)

    DSTP.RegisterCommand("set_player_speed", function(data)
        local player = FindPlayer(data.userid)
        local m = _G.tonumber(data.multiplier)
        if player and player.components.locomotor and m then
            if m == 1 then
                player.components.locomotor:RemoveExternalSpeedMultiplier(player, "dstp_speed")
            else
                player.components.locomotor:SetExternalSpeedMultiplier(player, "dstp_speed", m)
            end
        end
    end)

    -- Vitals: percent (0..1 via SetPercent) OR exact value.
    DSTP.RegisterCommand("set_health", function(data)
        local player = FindPlayer(data.userid)
        local h = player and player.components.health
        if not h then return end
        local p = _G.tonumber(data.percent)
        local v = _G.tonumber(data.value)
        if p then h:SetPercent(math.max(0, math.min(1, p)))
        elseif v then h:SetVal(v) end
    end)

    DSTP.RegisterCommand("set_hunger", function(data)
        local player = FindPlayer(data.userid)
        local hu = player and player.components.hunger
        if not hu then return end
        local p = _G.tonumber(data.percent)
        local v = _G.tonumber(data.value)
        if p then hu:SetPercent(math.max(0, math.min(1, p)))
        elseif v then hu.current = math.max(0, math.min(hu.max, v)); hu:DoDelta(0) end
    end)

    DSTP.RegisterCommand("set_sanity", function(data)
        local player = FindPlayer(data.userid)
        local s = player and player.components.sanity
        if not s then return end
        local p = _G.tonumber(data.percent)
        local v = _G.tonumber(data.value)
        if p then s:SetPercent(math.max(0, math.min(1, p)))
        elseif v then s.current = math.max(0, math.min(s.max, v)); s:DoDelta(0) end
    end)

    DSTP.RegisterCommand("set_max_health", function(data)
        local player = FindPlayer(data.userid)
        local v = _G.tonumber(data.value)
        if player and player.components.health and v and v > 0 then
            player.components.health:SetMaxHealth(v)
        end
    end)

    -- Tags: generic, safe-ish player mutation (fastpicker, insulated, ...).
    DSTP.RegisterCommand("add_tag", function(data)
        local player = FindPlayer(data.userid)
        if player and data.tag then player:AddTag(tostring(data.tag)) end
    end)

    DSTP.RegisterCommand("remove_tag", function(data)
        local player = FindPlayer(data.userid)
        if player and data.tag then player:RemoveTag(tostring(data.tag)) end
    end)

    -- call_component: invoke any method of any component on the player. This is
    -- ADMIN-POWER (RCE-equivalent on the server), same trust class as the `script`
    -- node and the existing `execute` command — gate it in the FLOW with
    -- get_player → condition {{player.admin}}==true. Contained by the outer pcall
    -- (a bad component/method name just logs, never crashes). The sentinel
    -- "{{self}}" in args is replaced by the player itself (many DST methods take
    -- `inst` as the first arg, e.g. locomotor:SetExternalSpeedMultiplier(inst,k,m)).
    DSTP.RegisterCommand("call_component", function(data)
        local player = FindPlayer(data.userid)
        if not (player and data.component and data.method) then return end
        local comp = player.components[data.component]
        if not comp then
            LogError("call_component: no component '" .. tostring(data.component) .. "'")
            return
        end
        local fn = comp[data.method]
        if type(fn) ~= "function" then
            LogError("call_component: '" .. tostring(data.component) .. "' has no method '" .. tostring(data.method) .. "'")
            return
        end
        -- Resolve args: "{{self}}" → the player entity; everything else passed as-is.
        local args = {}
        local n = 0
        if type(data.args) == "table" then
            for i, a in ipairs(data.args) do
                n = i
                args[i] = (a == "{{self}}") and player or a
            end
        end
        fn(comp, _G.unpack(args, 1, n))
    end)

    -- ---- Land claims (terrain protection) ----------------------------------
    -- These manage the claim store; the actual BLOCKING happens in modmain via
    -- workable/burnable/builder overrides that call LandClaims.IsProtected. The
    -- POLICY (who may claim, limits, cost) is up to the FLOW that calls these —
    -- e.g. gate claim_add behind condition {{player.admin}} or a coins check.
    -- A claim's position defaults to the player's current position when x/z are
    -- omitted (so a flow can do "!claim" with just the userid).

    local function ResolveXZ(data)
        if data.x ~= nil and data.z ~= nil then
            return tonumber(data.x), tonumber(data.z)
        end
        local player = data.userid and FindPlayer(data.userid)
        if player and player.Transform then
            local x, _, z = player.Transform:GetWorldPosition()
            return x, z
        end
        return nil, nil
    end

    DSTP.RegisterCommand("claim_add", function(data)
        if not LandClaims then return end
        local owner = data.owner or data.userid
        local x, z = ResolveXZ(data)
        if owner and x and z then
            LandClaims.Add(owner, x, z, data.radius)
        end
    end)

    DSTP.RegisterCommand("claim_remove", function(data)
        if not LandClaims then return end
        local x, z = nil, nil
        if data.x ~= nil and data.z ~= nil then x, z = tonumber(data.x), tonumber(data.z) end
        -- if no explicit point but a userid is given, remove the claim under them
        if (x == nil or z == nil) and data.at_player and data.userid then
            x, z = ResolveXZ(data)
        end
        LandClaims.Remove(data.owner, x, z)
    end)

    DSTP.RegisterCommand("claim_trust", function(data)
        if not LandClaims then return end
        local owner = data.owner or data.userid
        local x, z = ResolveXZ(data)
        if owner and data.friend then
            LandClaims.Trust(owner, x, z, tostring(data.friend), data.on ~= false)
        end
    end)

    DSTP.RegisterCommand("claim_list", function(data)
        if not LandClaims then return end
        DSTP.PushEvent("claim_list_result", {
            claims = LandClaims.List(),
            token = data.token,
        })
    end)

    DSTP.RegisterCommand("claim_check", function(data)
        if not LandClaims then return end
        local x, z = ResolveXZ(data)
        local owner = (x and z) and LandClaims.OwnerAt(x, z) or nil
        DSTP.PushEvent("claim_check_result", {
            x = x, z = z, owner = owner, protected = owner ~= nil,
            token = data.token,
        })
    end)

    DSTP.RegisterCommand("give_item", function(data)
        local player = FindPlayer(data.userid)
        if player and data.prefab then
            local item = _G.SpawnPrefab(data.prefab)
            if item then
                if data.count and item.components.stackable then
                    item.components.stackable:SetStackSize(data.count)
                end
                player.components.inventory:GiveItem(item)
            end
        end
    end)

    DSTP.RegisterCommand("remove_inventory", function(data)
        local player = FindPlayer(data.userid)
        if player then
            local inv = player.components.inventory
            if inv and data.slot and inv.itemslots[tonumber(data.slot)] then
                local item = inv.itemslots[tonumber(data.slot)]
                inv:RemoveItem(item)
                item:Remove()
            end
        end
    end)

    -- Count how many of a prefab a player holds (main inventory + overflow/backpack,
    -- summing stack sizes). Reports back via a `item_count` event so flows can read it.
    local function CountPrefab(inv, prefab)
        local total = 0
        local function scan(slots)
            for _, item in pairs(slots or {}) do
                if item and item.prefab == prefab then
                    if item.components.stackable then
                        total = total + item.components.stackable:StackSize()
                    else
                        total = total + 1
                    end
                end
            end
        end
        scan(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then scan(bp.slots) end
        return total
    end

    DSTP.RegisterCommand("count_item", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory and data.prefab then
            local n = CountPrefab(player.components.inventory, data.prefab)
            DSTP.PushEvent("item_count", {
                userid = data.userid, prefab = data.prefab, count = n,
                token = data.token,  -- echo so the flow can correlate
            })
        end
    end)

    -- Remove N of a prefab from a player's inventory, ATOMICALLY: only removes if
    -- the player has at least N (so a sale can't credit coins for items they lack).
    -- Reports the outcome via an `item_removed` event { prefab, requested, removed,
    -- success } — a sell flow listens for it and credits coins only on success.
    DSTP.RegisterCommand("remove_item", function(data)
        local player = FindPlayer(data.userid)
        local prefab = data.prefab
        local need = tonumber(data.count) or 1
        if not (player and player.components.inventory and prefab) then return end
        local inv = player.components.inventory

        local have = CountPrefab(inv, prefab)
        local success = have >= need
        local removed = 0

        if success then
            local remaining = need
            -- Walk a snapshot of matching items; remove/shrink stacks until satisfied.
            local function take(slots)
                for _, item in pairs(slots or {}) do
                    if remaining <= 0 then return end
                    if item and item.prefab == prefab then
                        local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                        if stack <= remaining then
                            inv:RemoveItem(item, true)
                            item:Remove()
                            removed = removed + stack
                            remaining = remaining - stack
                        else
                            -- shrink the stack in place
                            item.components.stackable:SetStackSize(stack - remaining)
                            removed = removed + remaining
                            remaining = 0
                        end
                    end
                end
            end
            take(inv.itemslots)
            local bp = inv:GetOverflowContainer()
            if bp then take(bp.slots) end
        end

        DSTP.PushEvent("item_removed", {
            userid = data.userid, prefab = prefab,
            requested = need, removed = removed, success = success,
            token = data.token,
        })
    end)

    -- has_item: boolean check (count >= need), reported via `item_has` event.
    DSTP.RegisterCommand("has_item", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory and data.prefab then
            local need = tonumber(data.count) or 1
            local have = CountPrefab(player.components.inventory, data.prefab)
            DSTP.PushEvent("item_has", {
                userid = data.userid, prefab = data.prefab,
                count = have, needed = need, has = have >= need,
                token = data.token,
            })
        end
    end)

    -- equip_item: spawn an item and equip it (falls back to inventory if not equippable).
    DSTP.RegisterCommand("equip_item", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory and data.prefab then
            local item = _G.SpawnPrefab(data.prefab)
            if item then
                if item.components.equippable then
                    player.components.inventory:Equip(item)
                else
                    player.components.inventory:GiveItem(item)
                end
            end
        end
    end)

    -- unequip: remove the item in an equip slot (hand/body/head) to inventory or drop.
    DSTP.RegisterCommand("unequip", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory then
            local SLOTS = { hand = _G.EQUIPSLOTS.HANDS, body = _G.EQUIPSLOTS.BODY, head = _G.EQUIPSLOTS.HEAD }
            local slot = SLOTS[tostring(data.slot or "hand")] or _G.EQUIPSLOTS.HANDS
            local item = player.components.inventory:GetEquippedItem(slot)
            if item then
                player.components.inventory:Unequip(slot)
                if data.drop then
                    player.components.inventory:DropItem(item)
                end
            end
        end
    end)

    -- drop_item: drop N of a prefab on the ground at the player's feet.
    DSTP.RegisterCommand("drop_item", function(data)
        local player = FindPlayer(data.userid)
        local prefab = data.prefab
        if not (player and player.components.inventory and prefab) then return end
        local inv = player.components.inventory
        local need = tonumber(data.count) or 1
        local dropped = 0
        local function take(slots)
            for _, item in pairs(slots or {}) do
                if dropped >= need then return end
                if item and item.prefab == prefab then
                    inv:DropItem(item)
                    local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                    dropped = dropped + stack
                end
            end
        end
        take(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then take(bp.slots) end
    end)

    -- clear_inventory: remove everything, or only a given prefab when data.prefab set.
    DSTP.RegisterCommand("clear_inventory", function(data)
        local player = FindPlayer(data.userid)
        if not (player and player.components.inventory) then return end
        local inv = player.components.inventory
        local only = data.prefab
        local function purge(slots)
            local victims = {}
            for _, item in pairs(slots or {}) do
                if item and (not only or item.prefab == only) then
                    table.insert(victims, item)
                end
            end
            for _, item in ipairs(victims) do
                inv:RemoveItem(item, true)
                item:Remove()
            end
        end
        purge(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then purge(bp.slots) end
        if not only then
            -- also clear equipped
            for _, slot in pairs(_G.EQUIPSLOTS) do
                local eq = inv:GetEquippedItem(slot)
                if eq then inv:Unequip(slot); eq:Remove() end
            end
        end
    end)

    -- transfer_item: move N of a prefab from one player to another. Atomic on the
    -- source side (only transfers what it can remove). Reports via item_transferred.
    DSTP.RegisterCommand("transfer_item", function(data)
        local from = FindPlayer(data.from_userid or data.userid)
        local to = FindPlayer(data.to_userid)
        local prefab = data.prefab
        local need = tonumber(data.count) or 1
        if not (from and to and prefab and from.components.inventory and to.components.inventory) then return end
        local inv = from.components.inventory
        local have = CountPrefab(inv, prefab)
        local moved = 0
        if have >= need then
            local remaining = need
            local function take(slots)
                for _, item in pairs(slots or {}) do
                    if remaining <= 0 then return end
                    if item and item.prefab == prefab then
                        local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                        if stack <= remaining then
                            inv:RemoveItem(item, true)
                            item:Remove()
                            moved = moved + stack
                            remaining = remaining - stack
                        else
                            item.components.stackable:SetStackSize(stack - remaining)
                            moved = moved + remaining
                            remaining = 0
                        end
                    end
                end
            end
            take(inv.itemslots)
            local bp = inv:GetOverflowContainer()
            if bp then take(bp.slots) end
            -- give the moved amount to the recipient
            if moved > 0 then
                local gift = _G.SpawnPrefab(prefab)
                if gift then
                    if moved > 1 and gift.components.stackable then
                        gift.components.stackable:SetStackSize(moved)
                    end
                    to.components.inventory:GiveItem(gift)
                end
            end
        end
        DSTP.PushEvent("item_transferred", {
            from_userid = data.from_userid or data.userid, to_userid = data.to_userid,
            prefab = prefab, requested = need, moved = moved, success = moved >= need,
            token = data.token,
        })
    end)

    -- dump_inventory: report the player's full inventory (item -> total count) via
    -- an `inventory_dump` event, so a sell UI can list what they can sell.
    DSTP.RegisterCommand("dump_inventory", function(data)
        local player = FindPlayer(data.userid)
        if not (player and player.components.inventory) then return end
        local inv = player.components.inventory
        local counts = {}
        local function scan(slots)
            for _, item in pairs(slots or {}) do
                if item then
                    local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                    counts[item.prefab] = (counts[item.prefab] or 0) + stack
                end
            end
        end
        scan(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then scan(bp.slots) end
        DSTP.PushEvent("inventory_dump", {
            userid = data.userid, items = counts, token = data.token,
        })
    end)

    DSTP.RegisterCommand("teleport", function(data)
        local player = FindPlayer(data.userid)
        if player and data.x and data.z then
            player.Transform:SetPosition(data.x, 0, data.z)
        end
    end)

    DSTP.RegisterCommand("teleport_to_player", function(data)
        local player = FindPlayer(data.userid)
        local target = FindPlayer(data.target_userid)
        if player and target then
            local x, y, z = target.Transform:GetWorldPosition()
            player.Transform:SetPosition(x, y, z)
        end
    end)

    DSTP.RegisterCommand("execute", function(data)
        if data.lua then
            local fn, err = loadstring(data.lua)
            if fn then
                setfenv(fn, _G)
                local ok, result = pcall(fn)
                if not ok then LogError("Execute failed: " .. tostring(result)) end
            else
                LogError("Execute parse error: " .. tostring(err))
            end
        end
    end)

    DSTP.RegisterCommand("rollback", function(data)
        _G.TheNet:SendWorldRollbackRequestToServer(data.days or 0)
    end)

    DSTP.RegisterCommand("regenerate", function(data)
        _G.TheWorld:DoTaskInTime(0, function()
            _G.TheNet:SendWorldResetRequestToServer()
        end)
    end)

    -- World control commands
    DSTP.RegisterCommand("set_season", function(data)
        if data.season then
            _G.TheWorld:PushEvent("ms_setseason", data.season)
        end
    end)

    DSTP.RegisterCommand("set_phase", function(data)
        if data.phase then
            _G.TheWorld:PushEvent("ms_setphase", data.phase)
        end
    end)

    DSTP.RegisterCommand("set_next_phase", function(data)
        _G.TheWorld:PushEvent("ms_nextphase")
    end)

    DSTP.RegisterCommand("set_rain", function(data)
        _G.TheWorld:PushEvent("ms_forceprecipitation", data.enabled ~= false)
    end)

    DSTP.RegisterCommand("stop_rain", function(data)
        _G.TheWorld:PushEvent("ms_forceprecipitation", false)
    end)

    DSTP.RegisterCommand("set_snow", function(data)
        if _G.TheWorld.components.moisture then
            _G.TheWorld.components.moisture:SetMoistureFloor(data.enabled ~= false and 250 or 0)
        end
    end)

    DSTP.RegisterCommand("lightning", function(data)
        if _G.TheWorld.components.lightningstrikemanager then
            local player = data.userid and FindPlayer(data.userid)
            if player then
                local x, y, z = player.Transform:GetWorldPosition()
                _G.TheWorld.components.lightningstrikemanager:DoLightningStrike(x, y, z)
            end
        end
    end)

    DSTP.RegisterCommand("set_day_length", function(data)
        if data.day and data.dusk and data.night then
            _G.TheWorld:PushEvent("ms_setclocksegs", {day = data.day, dusk = data.dusk, night = data.night})
        end
    end)

    DSTP.RegisterCommand("skip_day", function(data)
        local days = data.days or 1
        for i = 1, days do
            _G.TheWorld:PushEvent("ms_nextcycle")
        end
    end)

    DSTP.RegisterCommand("set_speed", function(data)
        local speed = data.speed or 1
        _G.TheSim:SetTimeScale(speed)
        if DSTP._DEBUG then Log("Time scale set to " .. tostring(speed)) end
    end)

    DSTP.RegisterCommand("pause", function(data)
        _G.TheSim:SetTimeScale(0)
        _G.TheNet:Announce("[DSTP] Server PAUSED")
        Log("Server paused")
    end)

    DSTP.RegisterCommand("unpause", function(data)
        _G.TheSim:SetTimeScale(1)
        _G.TheNet:Announce("[DSTP] Server RESUMED")
        Log("Server unpaused")
    end)

    DSTP.RegisterCommand("set_season_length", function(data)
        if data.season and data.length then
            _G.TheWorld:PushEvent("ms_setseasonlength", {season = data.season, length = data.length})
        end
    end)

    DSTP.RegisterCommand("spawn_prefab", function(data)
        if data.prefab and data.x and data.z then
            local ent = _G.SpawnPrefab(data.prefab)
            if ent then
                ent.Transform:SetPosition(data.x, 0, data.z)
                local count = data.count or 1
                if count > 1 and ent.components.stackable then
                    ent.components.stackable:SetStackSize(count)
                end
            end
        end
    end)

    DSTP.RegisterCommand("remove_near", function(data)
        if data.prefab and data.x and data.z then
            local radius = data.radius or 10
            local x, z = data.x, data.z
            local ents = _G.TheSim:FindEntities(x, 0, z, radius, nil, nil, nil)
            local removed = 0
            for _, ent in ipairs(ents) do
                if ent.prefab == data.prefab then
                    ent:Remove()
                    removed = removed + 1
                    if data.limit and removed >= data.limit then break end
                end
            end
        end
    end)

    -- Spawn prefab at player's position (or with offset)
    DSTP.RegisterCommand("spawn_at_player", function(data)
        local player = FindPlayer(data.userid)
        if not (player and data.prefab) then return end
        local x, _, z = player.Transform:GetWorldPosition()
        local ox, oz = tonumber(data.offset_x) or 0, tonumber(data.offset_z) or 0
        local count = math.max(1, math.min(tonumber(data.count) or 1, 20))

        local first = _G.SpawnPrefab(data.prefab)
        if not first then return end
        first.Transform:SetPosition(x + ox, 0, z + oz)

        if count > 1 and first.components.stackable then
            -- Stackable items: one entity, set the stack size.
            first.components.stackable:SetStackSize(count)
        elseif count > 1 then
            -- Non-stackable (mobs/structures): spawn N separate copies spread in
            -- a small ring around the player so they don't stack on one tile.
            for i = 2, count do
                local ent = _G.SpawnPrefab(data.prefab)
                if ent then
                    local ang = (i / count) * 2 * math.pi
                    local r = 2 + (i % 3)
                    ent.Transform:SetPosition(x + ox + math.cos(ang) * r, 0, z + oz + math.sin(ang) * r)
                end
            end
        end
        if DSTP._DEBUG then Log("Spawned " .. count .. "x " .. data.prefab .. " at " .. player.name) end
    end)

    -- Remove entities near a player
    DSTP.RegisterCommand("remove_near_player", function(data)
        local player = FindPlayer(data.userid)
        if player and data.prefab then
            local x, _, z = player.Transform:GetWorldPosition()
            local radius = tonumber(data.radius) or 10
            local ents = _G.TheSim:FindEntities(x, 0, z, radius, nil, nil, nil)
            local removed = 0
            local limit = tonumber(data.limit) or 999
            for _, ent in ipairs(ents) do
                if ent.prefab == data.prefab and ent ~= player then
                    ent:Remove()
                    removed = removed + 1
                    if removed >= limit then break end
                end
            end
            if DSTP._DEBUG then Log("Removed " .. removed .. "x " .. data.prefab .. " near " .. player.name) end
        end
    end)

    -- Destroy/hammer a structure at coordinates
    DSTP.RegisterCommand("destroy_structure", function(data)
        if data.x and data.z then
            local radius = tonumber(data.radius) or 3
            local ents = _G.TheSim:FindEntities(data.x, 0, data.z, radius, nil, nil, nil)
            for _, ent in ipairs(ents) do
                if (not data.prefab or ent.prefab == data.prefab) and ent.components and ent.components.workable then
                    ent.components.workable:Destroy(ent)
                    if DSTP._DEBUG then Log("Destroyed " .. ent.prefab) end
                    if not data.all then break end
                end
            end
        end
    end)

    DSTP.RegisterCommand("set_dump_mode", function(data)
        config.dump_mode = data.enabled ~= false
        if DSTP._DEBUG then Log("Dump mode: " .. tostring(config.dump_mode)) end
    end)

    -- UI Widget commands: send JSON command to a specific player's client
    -- data = { userid = "KU_xxx", cmd = { action="create", id="...", type="...", ... } }
    -- or data = { userid = "KU_xxx", cmd = { action="batch", commands = [{...}, ...] } }
    DSTP.RegisterCommand("ui_command", function(data)
        if not data.userid or not data.cmd then
            LogError("ui_command: missing userid or cmd")
            return
        end
        local player = FindPlayer(data.userid)
        if not player then
            LogError("ui_command: player not found: " .. tostring(data.userid))
            return
        end
        if not player.player_classified or not player.player_classified._dstp_ui then
            LogError("ui_command: player has no _dstp_ui net_string")
            return
        end
        local json_str = SafeEncode(data.cmd)
        if not json_str then
            LogError("ui_command: failed to encode cmd")
            return
        end
        player.player_classified._dstp_ui:set(json_str)
        if DSTP._DEBUG then Log("ui_command sent to " .. tostring(data.userid) .. ": " .. tostring(data.cmd.action)) end
    end)

    -- Broadcast UI command to all connected players
    -- data = { cmd = { action="create", ... } }
    DSTP.RegisterCommand("ui_broadcast", function(data)
        if not data.cmd then
            LogError("ui_broadcast: missing cmd")
            return
        end
        local json_str = SafeEncode(data.cmd)
        if not json_str then
            LogError("ui_broadcast: failed to encode cmd")
            return
        end
        for _, player in ipairs(_G.AllPlayers) do
            if player.player_classified and player.player_classified._dstp_ui then
                player.player_classified._dstp_ui:set(json_str)
            end
        end
        if DSTP._DEBUG then Log("ui_broadcast: " .. tostring(data.cmd.action) .. " to " .. #_G.AllPlayers .. " players") end
    end)

    -- Install rules for a specific player
    DSTP.RegisterCommand("install_rules", function(data)
        if not data.userid or not data.rules then return end
        local player = FindPlayer(data.userid)
        if not player or not player.player_classified or not player.player_classified._dstp_ui then return end
        local cmd = { action = "rules_install", rules = data.rules, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if json_str then
            player.player_classified._dstp_ui:set(json_str)
            if DSTP._DEBUG then Log("install_rules sent to " .. data.userid .. " (" .. #data.rules .. " rules)") end
        end
    end)

    -- Uninstall rules
    DSTP.RegisterCommand("uninstall_rules", function(data)
        if not data.userid or not data.ids then return end
        local player = FindPlayer(data.userid)
        if not player or not player.player_classified or not player.player_classified._dstp_ui then return end
        local cmd = { action = "rules_uninstall", ids = data.ids, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if json_str then
            player.player_classified._dstp_ui:set(json_str)
        end
    end)

    -- Set player state value (backend pushes a variable to client player_state)
    DSTP.RegisterCommand("set_player_state", function(data)
        if not data.userid or not data.key then return end
        local player = FindPlayer(data.userid)
        if not player or not player.player_classified or not player.player_classified._dstp_ui then return end
        local cmd = { action = "state_set", key = data.key, value = data.value, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if json_str then
            player.player_classified._dstp_ui:set(json_str)
        end
    end)

    -- Broadcast rules to ALL players
    DSTP.RegisterCommand("install_rules_all", function(data)
        if not data.rules then return end
        local cmd = { action = "rules_install", rules = data.rules, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if not json_str then return end
        for _, player in ipairs(_G.AllPlayers) do
            if player.player_classified and player.player_classified._dstp_ui then
                player.player_classified._dstp_ui:set(json_str)
            end
        end
        if DSTP._DEBUG then Log("install_rules broadcast (" .. #data.rules .. " rules)") end
    end)
end

return Commands
