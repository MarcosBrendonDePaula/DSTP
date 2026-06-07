-- DSTP HTTP — the adaptive poll loop that drives /dst/sync. Each cycle builds the
-- payload (collectors + drained event queue), POSTs via TheSim:QueryServer, and
-- applies the response (commands -> core.ProcessCommands, category hot-toggle ->
-- core.HotToggleEvents, debounce updates). Self-schedules its own delay. Extracted
-- from client.lua; bodies unchanged. Init(core, collectors) then Start(inst).

local Http = {}

local core, _G, config, state, evt_config, event_debounce
local SafeEncode, SafeDecode, ProcessCommands, LogError
local GetServerInfo, GetAllPlayersData, RefreshClientTable, GetPrefabList
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

    -- Don't start a second POST while one is still in flight. We drain the queue
    -- only AFTER the POST is confirmed (below), so without this guard a fast re-poll
    -- (0.1s when the queue is non-empty) could fire before the first callback
    -- returned and send the SAME events twice. One request at a time.
    -- Watchdog: if a callback never fires (network stack wedged), release the guard
    -- after 30s so polling can't deadlock permanently.
    if state.poll_in_flight then
        if state.poll_started_at and (_G.GetTime() - state.poll_started_at) > 30 then
            LogError("Poll callback never returned (>30s) — releasing in-flight guard")
            state.poll_in_flight = false
        else
            return
        end
    end

    RefreshClientTable()

    -- COPY (not remove) the front of the queue. The events stay in the queue until
    -- the POST is confirmed successful — see the callback. This is the #17 fix: the
    -- old code removed them here, so a failed POST (backend down) silently lost them.
    local batch_size = math.min(#state.event_queue, config.max_batch_size)
    local events = {}
    for i = 1, batch_size do
        events[i] = state.event_queue[i]
    end

    state.poll_in_flight = true
    state.poll_started_at = _G.GetTime()

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

    -- Prefab list: the full set of prefabs registered on THIS server, sent ONCE (it's
    -- big and static for the session). The backend caches it per server for the flow
    -- editor's prefab autocomplete, and can ask for it again (data.request_prefabs)
    -- if its cache was lost (restart). Marked sent only AFTER the POST confirms.
    local sending_prefabs = false
    if not state.prefabs_sent and GetPrefabList then
        payload.prefabs = GetPrefabList()
        sending_prefabs = true
    end

    local json_data = SafeEncode(payload)
    if not json_data then
        state.poll_in_flight = false  -- never sent; release the guard
        return
    end

    _G.TheSim:QueryServer(
        config.backend_url .. "/api/dst/sync",
        function(result, isSuccessful, resultCode)
            state.poll_in_flight = false
            if isSuccessful and result then
                local data = SafeDecode(result)
                if data then
                    -- POST confirmed: NOW drain the events we sent. We remove them BY
                    -- IDENTITY (each event is a unique table), not by position: during
                    -- the round-trip new events are appended AND the core queue cap
                    -- (max_batch_size*2) may have dropped some from the front, so
                    -- "remove the first batch_size" could delete the wrong ones. A
                    -- lookup set of the sent events keeps this exact even under churn.
                    local sent = {}
                    for i = 1, batch_size do sent[events[i]] = true end
                    local kept = {}
                    for _, ev in ipairs(state.event_queue) do
                        if not sent[ev] then kept[#kept + 1] = ev end
                    end
                    state.event_queue = kept
                    -- Log the offline -> online transition (not just every 10th attempt).
                    if not state.connected and state.connection_errors > 0 then
                        LogError("Connection RESTORED after " .. state.connection_errors .. " failed attempt(s)")
                    end
                    state.connected = true
                    state.connection_errors = 0
                    state.last_successful_poll = _G.GetTime()
                    -- Prefab list confirmed received → don't resend every poll.
                    if sending_prefabs then state.prefabs_sent = true end
                    -- Backend lost its cache (restart) → resend on the next poll.
                    if data.request_prefabs then state.prefabs_sent = false end
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
                -- POST failed: events were NOT removed from the queue, so they are
                -- retried on the next poll (no silent loss — the #17 fix). Log the
                -- online -> offline transition explicitly (first failure after being
                -- connected), then throttle the repeats to every 10th.
                if state.connected then
                    LogError("Connection LOST (" .. tostring(resultCode) .. ") — " ..
                        #state.event_queue .. " event(s) held for retry")
                end
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
    GetPrefabList = collectors.GetPrefabList
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
