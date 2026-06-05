local require = GLOBAL.require

local SERVER_ID = GetModConfigData("SERVER_ID") or ""
-- BACKEND_URL is fixed: DST sandbox only allows 127.0.0.1 for outbound HTTP.
-- Users run the DSTP relay (see relay/ directory), which listens on this port
-- and forwards to the actual public panel URL configured at build time.
-- Port 47834 is chosen from the unassigned IANA range to avoid conflicts
-- with common dev services (3000 is typical of Node, 8080 of Tomcat, etc).
local BACKEND_URL = "http://127.0.0.1:47834"
-- PANEL_URL is the public address of the web panel. It is NOT meant to be
-- authoritative: the mod asks the relay (/relay-status -> upstream) for the
-- live address and caches it here. This baked value is only the fallback used
-- before the relay has answered (or if it's offline). Keeping it pointed at
-- the current default avoids a broken first link.
local PANEL_URL = "https://dstp.marcosbrendon.com"
local DEBUG_LOGS = GetModConfigData("DEBUG_LOGS") == true

local function DebugLog(...)
    if DEBUG_LOGS then print(...) end
end
local POLL_INTERVAL = GetModConfigData("POLL_INTERVAL") or 5

-- Client-side UI widget manager (loaded on client only)
local UIWidgets = nil
-- Client-side rules engine (loaded on client only)
local RulesEngine = nil
-- Last _dstp_ui envelope seq we processed. The net_string replays its last value on
-- reconnect/dirty re-fire; the backend stamps a monotonic seq on each batch envelope
-- (mod-side counter), so we skip an envelope whose seq we've already applied. Dedup
-- lives HERE (the envelope passes only through this router) — sub-commands carry no
-- seq, so UIWidgets/RulesEngine never re-dedup them.
local _dstp_ui_seq = -1
-- Client-side key capture (loaded on client only, for the key_pressed trigger)
local Keys = nil

-- Generate ID from world session_identifier if auto
local is_auto_id = (SERVER_ID == "" or SERVER_ID == "auto")

-------------------------------------------------
-- Mod RPC: client → server panel URL request
-------------------------------------------------

-- UI Widget button callback: client → server → backend event queue
-- data_json (optional): JSON-encoded custom payload from client (rules emit_event etc.)
AddModRPCHandler(modname, "UICallback", function(player, callback_name, widget_id, data_json)
    if player and callback_name then
        -- Parse optional custom payload
        local data = nil
        if data_json and data_json ~= "" then
            local ok, parsed = GLOBAL.pcall(GLOBAL.json.decode, data_json)
            if ok then data = parsed end
        end
        local dstp_mod = require("dstp/client")
        dstp_mod.PushEvent("ui_callback", {
            userid = player.userid,
            name = player.name or "unknown",
            callback = callback_name,
            callback_name = callback_name,  -- alias for rules/schema consistency
            widget_id = widget_id or "",
            callback_data = data,
        })
    end
end)

-- key_pressed: client → server → backend event queue. The client (keys.lua) only
-- sends this for keys in the backend-provided watch set, on the down edge. Mirror
-- of UICallback: validate, then PushEvent so a flow's key_pressed trigger fires.
AddModRPCHandler(modname, "KeyPressed", function(player, key, down)
    if player and type(key) == "string" and key ~= "" then
        local dstp_mod = require("dstp/client")
        dstp_mod.PushEvent("key_pressed", {
            userid = player.userid,
            name = player.name or "unknown",
            key = key,
            down = (down == true),
        })
    end
end)

AddModRPCHandler(modname, "RequestPanel", function(player)
    DebugLog("[DSTP] RPC RequestPanel received from:", player and player.name or "unknown")
    -- Server validates: is this player actually an admin?
    local is_admin = false
    for _, client in ipairs(GLOBAL.TheNet:GetClientTable() or {}) do
        if client.userid == player.userid then
            is_admin = client.admin
            break
        end
    end

    if not (is_admin and player.player_classified) then return end

    local dstp_mod = require("dstp/client")
    -- Delegate to the client module's canonical path: it already resolved the
    -- panel domain from the relay's upstream on boot (cached in config.panel_url,
    -- with a localhost fallback) and issues the one-shot token in a SINGLE
    -- QueryServer call. Doing two nested QueryServer calls here previously
    -- dropped the token (DST has limited concurrent QueryServer slots).
    dstp_mod.SendUrlToAdmin(player)
end)

-------------------------------------------------
-- Private Message System on player_classified
-------------------------------------------------

AddPrefabPostInit("player_classified", function(inst)
    -- PM system (server → client)
    inst._dstp_pm = GLOBAL.net_string(inst.GUID, "dstp.pm", "dstp_pm_dirty")

    -- UI Widget system (server → client per-player)
    inst._dstp_ui = GLOBAL.net_string(inst.GUID, "dstp.ui", "dstp_ui_dirty")

    -- key_pressed watch set (server → client): which keys this client should watch.
    -- Declared on BOTH sides in a stable order (netvar positional rule). The server
    -- sets the same JSON array on every player; the client rebuilds its TheInput filter.
    inst._dstp_keys = GLOBAL.net_string(inst.GUID, "dstp.keys", "dstp_keys_dirty")

    -- Client: show PM in chat / auto-open URLs
    if not GLOBAL.TheWorld.ismastersim then
        inst:ListenForEvent("dstp_pm_dirty", function()
            local msg = inst._dstp_pm:value()
            if not msg or msg == "" then return end

            -- Panel links: open the URL silently, do NOT echo to chat.
            -- The link is built server-side from the backend's reported panel_url,
            -- so we trust it and open any http(s) URL — no host allowlist.
            if msg:sub(1, 7) == "Panel: " then
                local url = msg:match("(https?://[%w%.%-_:/%?=&#]+)")
                if url then
                    GLOBAL.VisitURL(url)
                end
                return
            end

            -- Other PMs (private_message action etc.): show in chat.
            if GLOBAL.ChatHistory then
                GLOBAL.ChatHistory:AddToHistory(
                    GLOBAL.ChatTypes.Message,
                    nil, nil, "[DSTP]", msg,
                    {0.4, 0.7, 1.0, 1.0},
                    "default", false, true, nil
                )
            end
        end)

        -- Client: process UI widget commands from backend
        inst:ListenForEvent("dstp_ui_dirty", function()
            local cmd_str = inst._dstp_ui:value()
            if not cmd_str or cmd_str == "" then return end

            -- Lazy-init widget manager on first use
            if not UIWidgets then
                UIWidgets = GLOBAL.require("dstp/ui_widgets")
                UIWidgets.Init({ GLOBAL = GLOBAL })

                -- Wire button callbacks: send RPC to server which queues an event
                -- AND dispatch into the local rules engine (if loaded) as a synthetic event
                UIWidgets.SetCallbackHandler(function(callback_name, widget_id)
                    if MOD_RPC and MOD_RPC[modname] and MOD_RPC[modname]["UICallback"] then
                        SendModRPCToServer(MOD_RPC[modname]["UICallback"], callback_name, widget_id, "")
                    end
                    if RulesEngine then
                        RulesEngine.OnUIButtonClick(callback_name, widget_id, nil)
                    end
                end)
            end

            local ok, cmd = GLOBAL.pcall(GLOBAL.json.decode, cmd_str)
            if not (ok and cmd and cmd.action) then return end

            -- Route ONE command by its OWN action prefix: rules_*/state_* -> RulesEngine,
            -- everything else -> UIWidgets. Lazy-inits RulesEngine on first rules/state.
            local function dispatch(c)
                if not (c and c.action) then return end
                local a = tostring(c.action)
                if a:sub(1, 6) == "rules_" or a:sub(1, 6) == "state_" then
                    if not RulesEngine then
                        RulesEngine = GLOBAL.require("dstp/rules_engine")
                        RulesEngine.Init({ GLOBAL = GLOBAL, modname = modname })
                        RulesEngine.SetUIWidgets(UIWidgets)
                    end
                    RulesEngine.ProcessCommand(c)
                else
                    UIWidgets.ProcessCommand(c)
                end
            end

            if cmd.action == "batch" then
                -- Coalesced envelope (the normal path). Dedup the whole envelope ONCE by
                -- its seq (net_string replays its last value), then fan out each
                -- sub-command by its OWN prefix so a mixed UI+rules batch reaches both
                -- sides. Sub-commands carry no seq, so neither side re-dedups them.
                if cmd.seq then
                    if cmd.seq <= _dstp_ui_seq then return end
                    _dstp_ui_seq = cmd.seq
                end
                if cmd.commands then
                    for _, sub in ipairs(cmd.commands) do dispatch(sub) end
                end
            else
                -- A lone (non-batch) command — route directly.
                dispatch(cmd)
            end
        end)

        -- Client: apply the key-watch set the backend shipped. Lazy-init the Keys
        -- module on first delivery, injecting the RPC sender (keys.lua owns no
        -- MOD_RPC reference). The handler only fires for watched keys, on the down
        -- edge, and not while typing — all in keys.lua.
        inst:ListenForEvent("dstp_keys_dirty", function()
            local raw = inst._dstp_keys:value()
            if not Keys then
                Keys = GLOBAL.require("dstp/keys")
                Keys.Init({
                    GLOBAL = GLOBAL,
                    SendRPC = function(key, down)
                        if MOD_RPC and MOD_RPC[modname] and MOD_RPC[modname]["KeyPressed"] then
                            SendModRPCToServer(MOD_RPC[modname]["KeyPressed"], key, down)
                        end
                    end,
                })
            end
            local list = {}
            if raw and raw ~= "" then
                local ok, parsed = GLOBAL.pcall(GLOBAL.json.decode, raw)
                if ok and type(parsed) == "table" then list = parsed end
            end
            Keys.SetWatchKeys(list)
        end)
    end
end)

-------------------------------------------------
-- Init DSTP client (server-side)
-------------------------------------------------

local env = {
    GLOBAL = GLOBAL,
    AddPrefabPostInit = AddPrefabPostInit,
}

local dstp = require("dstp/client")
dstp.Init(env, {
    server_id = is_auto_id and "auto" or SERVER_ID,
    is_auto_id = is_auto_id,
    backend_url = BACKEND_URL,
    panel_url_base = PANEL_URL,
    poll_interval = POLL_INTERVAL,
    debug_logs = GetModConfigData("DEBUG_LOGS") == true,
    events = {
        players = GetModConfigData("EVT_PLAYERS") ~= false,
        chat = GetModConfigData("EVT_CHAT") ~= false,
        world = GetModConfigData("EVT_WORLD") ~= false,
        combat = GetModConfigData("EVT_COMBAT") == true,
        crafting = GetModConfigData("EVT_CRAFTING") == true,
        inventory = GetModConfigData("EVT_INVENTORY") == true,
        weather = GetModConfigData("EVT_WEATHER") == true,
        bosses = GetModConfigData("EVT_BOSSES") == true,
        gathering = GetModConfigData("EVT_GATHERING") == true,
        survival = GetModConfigData("EVT_SURVIVAL") == true,
        health = GetModConfigData("EVT_HEALTH") == true,
        character = GetModConfigData("EVT_CHARACTER") == true,
        exploration = GetModConfigData("EVT_EXPLORATION") == true,
        griefing = GetModConfigData("EVT_GRIEFING") == true,
    },
})

-------------------------------------------------
-- Dynamic data bindings — replicate server-only data to the client
-------------------------------------------------
-- DST doesn't replicate things like mob health to clients. A "binding" declares
-- a piece of data to mirror via our own netvar. A generic interpreter wires it
-- up identically on both sides, so adding a new datum is a config entry, not a
-- new hand-written netvar. See specs/dynamic-data-bindings.md.
--
-- HARD RULES (learned from a net-stream crash — see specs/dst-client-constraints):
--  * Gate by inst.prefab (deterministic both sides), NEVER by tag.
--  * Declare the netvar synchronously, identically, on server and client.
--  * Only the server's value push may be deferred.
local _BIND = {
    net = { ushortint = GLOBAL.net_ushortint, uint = GLOBAL.net_uint },
}

-- Whitelisted SOURCES. Each defines:
--  gate(inst): does this entity get this binding? MUST return the SAME answer on
--    server and client AT PostInit TIME. The ONLY thing guaranteed identical and
--    available that early is inst.prefab — so we gate by a curated prefab set.
--    (We tried inst.replica.<comp>: the replica is populated over the network
--    AFTER PostInit on the client, so server said yes / client said no → netvar
--    desync + "Failed to read net var data" crash. Tags have the same problem.
--    See specs/dst-client-constraints.md. Prefab gating is non-negotiable.)
--  read(inst): server-side reader → cur, max.
--  hook: component method to wrap so changes re-push.

-- Curated prefab set for the health binding (mobs/bosses worth a HP bar).
local HEALTH_PREFABS = {}
for _, p in ipairs({
    "spider","spider_warrior","spider_hider","spider_spitter","spider_dropper",
    "hound","firehound","icehound","houndmound","killerbee","bee","mosquito",
    "frog","tentacle","tentacle_pillar","merm","pigman","pigguard","bunnyman",
    "perd","rabbit","crow","robin","robin_winter","butterfly","beefalo",
    "babybeefalo","koalefant_summer","koalefant_winter","walrus","little_walrus",
    "rocky","slurtle","snurtle","buzzard","catcoon","lightninggoat","monkey",
    "tallbird","teenbird","smallbird","knight","bishop","rook","mole","batilisk",
    "bat","worm","lureplant","eyeplant","krampus","spat","penguin",
    "mandrake_active","deerclops","bearger","moose","dragonfly","antlion",
    "minotaur","leif","leif_sparse","spiderqueen","warg","klaus","toadstool",
    "stalker","stalker_forest","beequeen","crabking","malbatross",
    "crawlinghorror","terrorbeak","nightmarebeak","crawlingnightmare",
    "shadowtentacle","bishop_nightmare","rook_nightmare","knight_nightmare",
}) do HEALTH_PREFABS[p] = true end

local BIND_SOURCES = {
    health = {
        gate = function(inst) return HEALTH_PREFABS[inst.prefab] == true end,
        read = function(inst)
            local h = inst.components and inst.components.health
            if not h then return nil end
            return h.currenthealth, h.maxhealth
        end,
        hook = { comp = "health", method = "DoDelta" },
    },
    -- add more here (temperature, hunger, sanity…) with zero changes elsewhere
}

-- The active bindings. Mob-HP is the first binding.
-- Applied in a fixed id-sorted order so netvar declaration order matches.
local BINDINGS = {
    { id = "hp", source = "health", as = "dstp_hp", net = "ushortint" },
}

table.sort(BINDINGS, function(a, b) return a.id < b.id end)
local function clamp16(v) v = math.floor(v or 0); if v < 0 then v = 0 end; if v > 65535 then v = 65535 end; return v end

AddPrefabPostInitAny(function(inst)
    if inst.prefab == nil or inst:HasTag("player") then return end
    local isServer = (not GLOBAL.TheWorld) or GLOBAL.TheWorld.ismastersim

    for _, b in ipairs(BINDINGS) do
        local src = BIND_SOURCES[b.source]
        if src and src.gate(inst) then
            local ctor = _BIND.net[b.net] or GLOBAL.net_ushortint
            -- declare identically on both sides (cur + max)
            inst["_b_" .. b.as] = ctor(inst.GUID, b.as, b.as .. "_dirty")
            inst["_b_" .. b.as .. "_max"] = ctor(inst.GUID, b.as .. "_max", b.as .. "_max_dirty")

            if isServer then
                local nv, nvmax = inst["_b_" .. b.as], inst["_b_" .. b.as .. "_max"]
                local function push()
                    local cur, max = src.read(inst)
                    if cur == nil then return end
                    nv:set(clamp16(cur)); nvmax:set(clamp16(max))
                end
                inst:DoTaskInTime(0, function()
                    local comp = inst.components and inst.components[src.hook.comp]
                    if not comp then return end
                    local m = src.hook.method
                    local orig = comp[m]
                    comp[m] = function(self, ...) local r = orig(self, ...); push(); return r end
                    push()
                end)
            else
                -- client: cache values on the entity under <as>/<as>_max
                local as, asmax = b.as, b.as .. "_max"
                inst:ListenForEvent(as .. "_dirty", function() inst[as] = inst["_b_" .. as]:value() end)
                inst:ListenForEvent(asmax .. "_dirty", function() inst[asmax] = inst["_b_" .. asmax]:value() end)
            end
        end
    end
end)

-------------------------------------------------
-- Admin Panel Access
-------------------------------------------------
-- Panel access is via chat command `#panel` (admins only).
-- See HandleBuiltinCommand in scripts/dstp/client.lua.
-- The old Tab scoreboard button was removed to keep panel opening explicit.

-------------------------------------------------
-- Land claims — terrain protection (server-side blocking)
-------------------------------------------------
-- The claim store + IsProtected live in the dstp/land_claims singleton (also
-- required by client.lua, so it's the SAME table). These overrides are the only
-- way to VETO an action: workable:WorkedBy_Internal and burnable:Ignite apply
-- their effect synchronously in-frame with no veto callback, so we wrap them and
-- skip the original when the target sits in someone else's claim. A flow can't do
-- this — it round-trips through the backend, far too slow to block a frame action.
-- Always installed; with no claims, IsProtected returns false (≈ zero cost).
local _claims = GLOBAL.require("dstp/land_claims")

local function ClaimPos(inst)
    if inst and inst.Transform then
        local x, _, z = inst.Transform:GetWorldPosition()
        return x, z
    end
end

-- workable: blocks hammer / mine / chop / deconstruct on protected structures.
AddComponentPostInit("workable", function(self)
    local _WorkedBy_Internal = self.WorkedBy_Internal
    if not _WorkedBy_Internal then return end
    function self:WorkedBy_Internal(worker, numworks, ...)
        local x, z = ClaimPos(self.inst)
        if x and _claims.IsProtected(x, z, worker) then
            return  -- protected: ignore the work entirely
        end
        return _WorkedBy_Internal(self, worker, numworks, ...)
    end
end)

-- burnable: blocks igniting protected structures (player- or world-caused fire).
AddComponentPostInit("burnable", function(self)
    local _Ignite = self.Ignite
    if not _Ignite then return end
    function self:Ignite(immediate, source, doer, ...)
        local x, z = ClaimPos(self.inst)
        if x and _claims.IsProtected(x, z, doer) then
            return  -- protected: do not catch fire
        end
        return _Ignite(self, immediate, source, doer, ...)
    end
end)

-- builder: blocks PLACING structures inside someone else's claim. DoBuild's `pt`
-- is the world placement point (Vector3) for placer recipes; a nil pt means an
-- inventory craft (a spear, food…) which is NOT grief — so we only guard when a
-- pt is present. The doer is the builder's inst (self.inst).
AddComponentPostInit("builder", function(self)
    local _DoBuild = self.DoBuild
    if not _DoBuild then return end
    function self:DoBuild(recname, pt, ...)
        if pt and pt.x and _claims.IsProtected(pt.x, pt.z, self.inst) then
            return false  -- protected area: refuse to place the structure
        end
        return _DoBuild(self, recname, pt, ...)
    end
end)

-- Non-player event hooks. newcombattarget (aggro) fires on the MOB, and trade fires
-- on the NPC/structure RECEIVER — neither is a player, so they can't ride the per-
-- player fan-out. We attach a ListenForEvent to EVERY combat/trader entity here; the
-- module (events/nonplayer.lua) filters hard (combat: only mob→player aggro) and gates
-- on evt_config, so with those categories off it's a cheap early-return. The hooks are
-- published on core by Events.Init (already run inside dstp.Init above); read them
-- dynamically so load order can't matter.
local _evcore = GLOBAL.require("dstp/core")
AddComponentPostInit("combat", function(self)
    if _evcore.HookCombatComponent then _evcore.HookCombatComponent(self) end
end)
AddComponentPostInit("trader", function(self)
    if _evcore.HookTraderComponent then _evcore.HookTraderComponent(self) end
end)
