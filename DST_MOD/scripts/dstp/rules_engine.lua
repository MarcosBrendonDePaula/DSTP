-- DSTP Rules Engine — Client-side declarative JSON rules interpreter
-- Backend pushes rules via net_string; client reacts to player/UI events locally
-- No code compilation: rules are pure data (when/do pattern)

local RulesEngine = {}

local _G = nil
local UIWidgets = nil

-- State
local active_rules = {}          -- id -> rule
local player_state = {}          -- key -> value (per-player local state)
local event_listeners = {}       -- event_name -> { rule_id, rule_id, ... }
local listener_cleanup = {}      -- event_name -> { fn = listener, inst = ThePlayer }
local _seq = -1

-- modname cached for RPC (set in Init)
local _modname = nil

-------------------------------------------------
-- Logging
-------------------------------------------------
local function Log(msg)
    print("[DSTP Rules] " .. msg)
end

-------------------------------------------------
-- Template resolution
-------------------------------------------------

--- Look up a dotted path in the given context tables.
--- path: "event.callback_data.item" or "state.last_click" or "player.health_current"
local function LookupPath(path, event_data)
    local parts = {}
    for seg in string.gmatch(path, "[^%.]+") do
        table.insert(parts, seg)
    end
    if #parts == 0 then return nil end

    local root = parts[1]
    local value = nil

    if root == "event" then
        value = event_data
    elseif root == "state" then
        value = player_state
    elseif root == "player" then
        -- Resolve live player properties lazily
        local p = _G.ThePlayer
        if not p then return nil end
        local key = parts[2]
        if not key then return p end

        if key == "userid" then return p.userid end
        if key == "name" then return p.name end
        if key == "prefab" then return p.prefab end

        if key == "health_current" or key == "health_max" then
            local h = p.replica and p.replica.health
            if not h then return nil end
            if key == "health_current" then return h:GetCurrent() end
            return h:Max()
        end
        if key == "hunger_current" or key == "hunger_max" then
            local h = p.replica and p.replica.hunger
            if not h then return nil end
            if key == "hunger_current" then return h:GetCurrent() end
            return h:Max()
        end
        if key == "sanity_current" or key == "sanity_max" then
            local s = p.replica and p.replica.sanity
            if not s then return nil end
            if key == "sanity_current" then return s:GetCurrent() end
            return s:Max()
        end
        if key == "x" or key == "y" or key == "z" then
            if not p.Transform then return nil end
            local x, y, z = p.Transform:GetWorldPosition()
            if key == "x" then return x end
            if key == "y" then return y end
            return z
        end
        return nil
    else
        return nil
    end

    -- Walk remaining segments
    for i = 2, #parts do
        if type(value) ~= "table" then return nil end
        value = value[parts[i]]
    end
    return value
end

--- Resolve a template: returns raw value if pure `{{path}}`, else string interpolation.
--- Non-string values returned as-is.
local function ResolveValue(template, event_data)
    if type(template) ~= "string" then
        -- Deep-resolve tables
        if type(template) == "table" then
            local out = {}
            for k, v in pairs(template) do
                out[k] = ResolveValue(v, event_data)
            end
            return out
        end
        return template
    end

    -- Pure `{{path}}` — return raw value (preserves type)
    local pure = string.match(template, "^%s*{{%s*([^}]-)%s*}}%s*$")
    if pure then
        return LookupPath(pure, event_data)
    end

    -- Mixed string: interpolate
    local result = string.gsub(template, "{{%s*([^}]-)%s*}}", function(path)
        local v = LookupPath(path, event_data)
        if v == nil then return "" end
        return tostring(v)
    end)
    return result
end

-------------------------------------------------
-- Condition evaluators
-------------------------------------------------

local function ToNumber(v)
    if type(v) == "number" then return v end
    if type(v) == "string" then return tonumber(v) end
    return nil
end

local function EvalCondition(cond, event_data)
    local op = cond.op or "equals"
    -- Field can be a dotted path (e.g. "callback_name", "callback_data.item", "state.x")
    -- Resolved relative to event_data by default if no prefix; otherwise path is used as-is
    local field = cond.field or ""
    local left
    if field:find("%.") or field == "event" or field == "state" or field == "player" then
        -- If it's a bare root without prefix, treat as event.<field>
        if field:sub(1, 6) ~= "event." and field:sub(1, 6) ~= "state." and field:sub(1, 7) ~= "player." then
            left = LookupPath(field, event_data)
        else
            left = LookupPath(field, event_data)
        end
    else
        -- Bare field name: read from event_data
        left = event_data and event_data[field]
    end

    local right = ResolveValue(cond.value, event_data)

    if op == "equals" then
        return left == right
    elseif op == "not_equals" then
        return left ~= right
    elseif op == "greater_than" then
        local a, b = ToNumber(left), ToNumber(right)
        return a ~= nil and b ~= nil and a > b
    elseif op == "less_than" then
        local a, b = ToNumber(left), ToNumber(right)
        return a ~= nil and b ~= nil and a < b
    elseif op == "contains" then
        if type(left) == "string" and type(right) == "string" then
            return string.find(left, right, 1, true) ~= nil
        end
        if type(left) == "table" then
            for _, v in pairs(left) do
                if v == right then return true end
            end
        end
        return false
    elseif op == "exists" then
        return left ~= nil
    end
    Log("unknown op '" .. tostring(op) .. "'")
    return false
end

local function EvalConditions(conditions, event_data)
    if not conditions or #conditions == 0 then return true end
    for _, c in ipairs(conditions) do
        if not EvalCondition(c, event_data) then return false end
    end
    return true
end

-------------------------------------------------
-- Action handlers
-------------------------------------------------

local function ActionShowWidget(action, event_data)
    if not UIWidgets then return end
    local resolved = ResolveValue(action, event_data)
    UIWidgets.CreateWidget(resolved)
end

local function ActionHideWidget(action, event_data)
    if not UIWidgets then return end
    local id = ResolveValue(action.id, event_data)
    UIWidgets.DestroyWidget({ id = id })
end

local function ActionUpdateWidget(action, event_data)
    if not UIWidgets then return end
    local resolved = ResolveValue(action, event_data)
    UIWidgets.UpdateWidget(resolved)
end

local function ActionSetState(action, event_data)
    local key = ResolveValue(action.key, event_data)
    if not key then return end
    local value = ResolveValue(action.value, event_data)
    player_state[key] = value
end

local function ActionEmitEvent(action, event_data)
    local name = ResolveValue(action.name, event_data)
    if not name or name == "" then return end
    local data = ResolveValue(action.data or {}, event_data)

    local MOD_RPC = _G.MOD_RPC
    local SendModRPCToServer = _G.SendModRPCToServer
    if not (MOD_RPC and _modname and MOD_RPC[_modname] and MOD_RPC[_modname]["UICallback"]) then
        Log("emit_event: UICallback RPC not available")
        return
    end

    local ok, json_data = pcall(_G.json.encode, data or {})
    if not ok then json_data = "" end

    SendModRPCToServer(
        MOD_RPC[_modname]["UICallback"],
        "rule_event:" .. tostring(name),
        "",            -- widget_id unused
        json_data      -- NEW custom payload
    )
end

local function ActionPlaySound(action, event_data)
    local sound = ResolveValue(action.sound, event_data)
    if not sound then return end
    local p = _G.ThePlayer
    if p and p.SoundEmitter then
        p.SoundEmitter:PlaySound(sound)
    end
end

local ACTIONS = {
    show_widget   = ActionShowWidget,
    hide_widget   = ActionHideWidget,
    update_widget = ActionUpdateWidget,
    set_state     = ActionSetState,
    state_set     = ActionSetState,     -- alias
    emit_event    = ActionEmitEvent,
    play_sound    = ActionPlaySound,
}

local function ExecuteActions(actions, event_data)
    if not actions then return end
    for _, a in ipairs(actions) do
        local fn = ACTIONS[a.action]
        if fn then
            local ok, err = pcall(fn, a, event_data)
            if not ok then Log("action '" .. tostring(a.action) .. "' failed: " .. tostring(err)) end
        else
            Log("unknown action '" .. tostring(a.action) .. "'")
        end
    end
end

-------------------------------------------------
-- Event handling
-------------------------------------------------

--- Called by the installed DST listener OR by external triggers (ui_button_click etc.)
function RulesEngine.HandleEvent(event_name, event_data)
    local ids = event_listeners[event_name]
    if not ids then return end

    event_data = event_data or {}

    for _, rule_id in ipairs(ids) do
        local rule = active_rules[rule_id]
        if rule then
            if EvalConditions(rule.when and rule.when.conditions, event_data) then
                ExecuteActions(rule["do"], event_data)
            end
        end
    end
end

--- Convert a raw DST event data object into a flat, safe table (strip entities)
local function FlattenEventData(data)
    if type(data) ~= "table" then return { value = data } end
    local out = {}
    for k, v in pairs(data) do
        local t = type(v)
        if t == "string" or t == "number" or t == "boolean" then
            out[k] = v
        elseif t == "table" then
            -- Shallow: include prefab/name if entity-like
            if v.prefab then out[k] = { prefab = v.prefab, name = v.name } end
        end
    end
    return out
end

--- Install a listener on ThePlayer for a given DST event
local function InstallPlayerListener(event_name)
    if listener_cleanup[event_name] then return end
    local p = _G.ThePlayer
    if not p or not p:IsValid() then return end

    local listener = function(inst, data)
        local flat = FlattenEventData(data)
        RulesEngine.HandleEvent(event_name, flat)
    end
    p:ListenForEvent(event_name, listener)
    listener_cleanup[event_name] = { fn = listener, inst = p }
end

local function UninstallPlayerListener(event_name)
    local entry = listener_cleanup[event_name]
    if not entry then return end
    if entry.inst and entry.inst:IsValid() then
        entry.inst:RemoveEventCallback(event_name, entry.fn)
    end
    listener_cleanup[event_name] = nil
end

-- Internal (synthetic) events we dispatch ourselves, not via DST listeners
local INTERNAL_EVENTS = {
    ui_button_click = true,
}

-------------------------------------------------
-- Rule install/uninstall
-------------------------------------------------

local function InstallRule(rule)
    if not rule or not rule.id or not rule.when or not rule.when.event then
        Log("install: rule missing id/when.event")
        return
    end

    -- Uninstall prior version first
    if active_rules[rule.id] then
        RulesEngine.UninstallRule(rule.id)
    end

    active_rules[rule.id] = rule

    local evt = rule.when.event
    event_listeners[evt] = event_listeners[evt] or {}
    table.insert(event_listeners[evt], rule.id)

    -- Hook DST listener unless it's a synthetic event
    if not INTERNAL_EVENTS[evt] then
        InstallPlayerListener(evt)
    end

    Log("installed '" .. rule.id .. "' on " .. evt)
end

function RulesEngine.UninstallRule(rule_id)
    local rule = active_rules[rule_id]
    if not rule then return end

    local evt = rule.when and rule.when.event
    active_rules[rule_id] = nil

    if evt and event_listeners[evt] then
        local filtered = {}
        for _, id in ipairs(event_listeners[evt]) do
            if id ~= rule_id then table.insert(filtered, id) end
        end
        event_listeners[evt] = filtered
        -- Remove underlying DST listener if nothing else uses it
        if #filtered == 0 then
            event_listeners[evt] = nil
            if not INTERNAL_EVENTS[evt] then
                UninstallPlayerListener(evt)
            end
        end
    end
    Log("uninstalled '" .. rule_id .. "'")
end

function RulesEngine.ClearRules()
    local ids = {}
    for id, _ in pairs(active_rules) do table.insert(ids, id) end
    for _, id in ipairs(ids) do RulesEngine.UninstallRule(id) end
    -- Extra safety: drop any stragglers
    for evt, _ in pairs(listener_cleanup) do
        UninstallPlayerListener(evt)
    end
    active_rules = {}
    event_listeners = {}
    Log("cleared all rules")
end

-------------------------------------------------
-- Public API
-------------------------------------------------

function RulesEngine.Init(env)
    _G = env.GLOBAL
    _modname = env.modname
end

function RulesEngine.SetUIWidgets(widgets)
    UIWidgets = widgets
end

--- Dispatched by modmain when a button click comes in (synthetic bridge event)
function RulesEngine.OnUIButtonClick(callback_name, widget_id, callback_data)
    RulesEngine.HandleEvent("ui_button_click", {
        callback_name = callback_name,
        widget_id = widget_id,
        callback_data = callback_data or {},
    })
end

function RulesEngine.ProcessCommand(cmd)
    if not cmd or not cmd.action then
        Log("invalid command")
        return
    end

    if cmd.seq then
        if cmd.seq <= _seq then return end
        _seq = cmd.seq
    end

    local action = cmd.action

    if action == "rules_install" then
        if cmd.rules then
            for _, r in ipairs(cmd.rules) do InstallRule(r) end
        elseif cmd.rule then
            InstallRule(cmd.rule)
        end
    elseif action == "rules_uninstall" then
        if cmd.ids then
            for _, id in ipairs(cmd.ids) do RulesEngine.UninstallRule(id) end
        elseif cmd.id then
            RulesEngine.UninstallRule(cmd.id)
        end
    elseif action == "rules_clear" then
        RulesEngine.ClearRules()
    elseif action == "state_set" then
        if cmd.key then player_state[cmd.key] = cmd.value end
    elseif action == "state_delete" then
        if cmd.key then player_state[cmd.key] = nil end
    elseif action == "state_clear" then
        player_state = {}
    elseif action == "batch" then
        -- Defensive: the client router (modmain) normally fans out a batch envelope and
        -- only hands us individual rules_/state_ subs, so we shouldn't see "batch" here.
        -- But if a pure-rules batch ever reaches us, iterate its subs rather than drop it.
        if cmd.commands then
            for _, sub in ipairs(cmd.commands) do RulesEngine.ProcessCommand(sub) end
        end
    else
        Log("unknown action '" .. tostring(action) .. "'")
    end
end

--- Debugging helpers
function RulesEngine.GetRuleCount()
    local n = 0
    for _ in pairs(active_rules) do n = n + 1 end
    return n
end

function RulesEngine.GetState(key)
    if key then return player_state[key] end
    return player_state
end

return RulesEngine
