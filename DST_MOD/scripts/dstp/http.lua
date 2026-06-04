-- DSTP HTTP — the adaptive poll loop that drives /dst/sync. Each cycle builds the
-- payload (collectors + drained event queue), POSTs via TheSim:QueryServer, and
-- applies the response (commands -> core.ProcessCommands, category hot-toggle ->
-- core.HotToggleEvents, debounce updates). Self-schedules its own delay. Extracted
-- from client.lua; bodies unchanged. Init(core, collectors) then Start(inst).

local Http = {}

local core, _G, config, state, evt_config, event_debounce
local SafeEncode, SafeDecode, ProcessCommands, LogError
local GetServerInfo, GetAllPlayersData, RefreshClientTable
-- HotToggleEvents comes from core (set by chat.Init); read dynamically.
local function HotToggleEvents(req) if core.HotToggleEvents then core.HotToggleEvents(req) end end
-- SetWatchKeys (key_pressed watch set) lives on core; read dynamically.
local function SetWatchKeys(list) if core.SetWatchKeys then core.SetWatchKeys(list) end end

local function ComputeNextDelay()
    -- Events in queue → flush ASAP. With the relay buffering pushed commands
    -- locally (WS), the round-trip cost of a fast poll is tiny, so we poll
    -- aggressively to make reactions (e.g. heal-on-hit) near-instant.
    if #state.event_queue > 0 then return 0.1 end

    -- Burst mode: backend sent commands recently → stay responsive
    if state.last_cmd_count > 0 then return 0.5 end

    -- Idle: no players connected → slow way down
    local client_count = 0
    for _, c in pairs(_G.TheNet and _G.TheNet:GetClientTable() or {}) do
        if c.userid and c.userid ~= "" then client_count = client_count + 1 end
    end
    if client_count == 0 then return 30 end

    -- Active server: use configured poll_interval as baseline
    return config.poll_interval
end

local function DoPoll()
    if not _G.TheWorld or not _G.TheWorld.ismastersim then return end

    RefreshClientTable()

    local events = {}
    for i = 1, math.min(#state.event_queue, config.max_batch_size) do
        table.insert(events, table.remove(state.event_queue, 1))
    end

    local payload = {
        server_id = config.server_id,
        shard_id = config.shard_id,
        shard_type = config.shard_type,
        server = GetServerInfo(),
        players = GetAllPlayersData(),
        events = events,
        active_events = evt_config,
        debounce = event_debounce,
    }

    local json_data = SafeEncode(payload)
    if not json_data then return end

    _G.TheSim:QueryServer(
        config.backend_url .. "/api/dst/sync",
        function(result, isSuccessful, resultCode)
            if isSuccessful and result then
                local data = SafeDecode(result)
                if data then
                    state.connected = true
                    state.connection_errors = 0
                    state.last_successful_poll = _G.GetTime()
                    if data.commands and #data.commands > 0 then
                        state.last_cmd_count = #data.commands
                        ProcessCommands(data.commands)
                    else
                        state.last_cmd_count = 0
                    end
                    -- Hot-toggle event categories from backend
                    if data.enable_events then
                        HotToggleEvents(data.enable_events)
                    end
                    -- Update the key_pressed watch set (which keys clients listen for)
                    if data.watch_keys then
                        SetWatchKeys(data.watch_keys)
                    end
                    -- Update debounce times from backend
                    if data.debounce then
                        for k, v in pairs(data.debounce) do
                            if type(v) == "number" then
                                event_debounce[k] = v
                            end
                        end
                    end
                end
            else
                state.connection_errors = state.connection_errors + 1
                state.connected = false
                if state.connection_errors % 10 == 1 then
                    LogError("Connection failed (attempt " .. state.connection_errors .. "): " .. tostring(resultCode))
                end
            end
        end,
        "POST",
        json_data
    )
end

function Http.Init(c, collectors)
    core = c
    _G = c._G
    config = c.config
    state = c.state
    evt_config = c.evt_config
    event_debounce = c.event_debounce
    SafeEncode = c.SafeEncode
    SafeDecode = c.SafeDecode
    ProcessCommands = c.ProcessCommands
    LogError = c.LogError
    GetServerInfo = collectors.GetServerInfo
    GetAllPlayersData = collectors.GetAllPlayersData
    RefreshClientTable = collectors.RefreshClientTable
    state.next_poll_delay = nil
    state.last_cmd_count = 0
    return Http
end

-- Start the self-scheduling adaptive poll on the world inst. First poll after 2s.
function Http.Start(inst)
    local function ScheduleNextPoll()
        local delay = ComputeNextDelay()
        inst:DoTaskInTime(delay, function()
            DoPoll()
            ScheduleNextPoll()
        end)
    end
    inst:DoTaskInTime(2, function()
        DoPoll()
        ScheduleNextPoll()
    end)
end

return Http
