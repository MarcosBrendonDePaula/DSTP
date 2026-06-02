name = "DSTP - Admin Panel"
description = "Web-based admin panel for Don't Starve Together servers. Manage players, inventory, stats and more from your browser."
author = "marcos"
version = "0.2.0"

forumthread = ""
api_version = 10

dst_compatible = true
dont_starve_compatible = false
reign_of_giants_compatible = false

all_clients_require_mod = false
client_only_mod = false

server_filter_tags = {"admin panel", "web admin", "dstp"}

configuration_options = {
    {
        name = "SERVER_ID",
        label = "Server ID",
        hover = "Fixed unique ID for this server. Leave 'Auto' to generate a random ID on startup (shown in server log).",
        options = {
            {description = "Auto (random)", data = "auto"},
            {description = "server-1", data = "server-1"},
            {description = "server-2", data = "server-2"},
            {description = "server-3", data = "server-3"},
            {description = "server-4", data = "server-4"},
            {description = "server-5", data = "server-5"},
        },
        default = "auto",
    },
    -- BACKEND_URL and PANEL_URL are hardcoded in modmain.lua.
    -- The mod always talks to 127.0.0.1:3000 (DSTP relay); the relay forwards
    -- to the actual panel backend. This is the only URL DST's sandbox allows.
    {
        name = "POLL_INTERVAL",
        label = "Poll Interval",
        hover = "How often to sync with the backend (in seconds).",
        options = {
            {description = "0.1s (Insane)", data = 0.1},
            {description = "0.25s (Ultra+)", data = 0.25},
            {description = "0.5s (Ultra)", data = 0.5},
            {description = "1s (Fast)", data = 1},
            {description = "2s", data = 2},
            {description = "5s (Default)", data = 5},
            {description = "10s", data = 10},
            {description = "30s (Slow)", data = 30},
        },
        default = 5,
    },
    {
        name = "DEBUG_LOGS",
        label = "Debug Logs",
        hover = "Mostrar logs detalhados do DSTP no console do servidor. Desative em produção para manter o log limpo.",
        options = {{description = "Off (recomendado)", data = false}, {description = "On", data = true}},
        default = false,
    },
    -- Event categories
    {
        name = "EVT_PLAYERS",
        label = "Events: Players",
        hover = "Track player join, leave, death, respawn.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = true,
    },
    {
        name = "EVT_CHAT",
        label = "Events: Chat",
        hover = "Capture chat messages.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = true,
    },
    {
        name = "EVT_WORLD",
        label = "Events: World",
        hover = "Track season, phase, day cycle changes.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = true,
    },
    {
        name = "EVT_COMBAT",
        label = "Events: Combat",
        hover = "Track player combat (attacks, kills). Medium load.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_CRAFTING",
        label = "Events: Crafting",
        hover = "Track item crafting and structure building.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_INVENTORY",
        label = "Events: Inventory",
        hover = "Track equip, pickup, drop. Heavy load.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_WEATHER",
        label = "Events: Weather",
        hover = "Track rain, storms, lightning.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_BOSSES",
        label = "Events: Bosses",
        hover = "Track boss kills and spawns.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_GATHERING",
        label = "Events: Gathering",
        hover = "Track resource gathering (chop, mine, harvest, loot drops with details).",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_SURVIVAL",
        label = "Events: Survival",
        hover = "Track eating, sanity, starving, freezing, overheating, mounting.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_HEALTH",
        label = "Events: Health Ticks",
        hover = "Track health/hunger/sanity changes. VERY HEAVY - only enable for debugging.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_CHARACTER",
        label = "Events: Character",
        hover = "Track character-specific events: recipe learned, book read, were-transform, sleep/wake.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_EXPLORATION",
        label = "Events: Exploration",
        hover = "Track ocean/boat events: sink, fish caught, boat entered/exited.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
    {
        name = "EVT_GRIEFING",
        label = "Events: Griefing (Anti-Grief)",
        hover = "Track structures burnt, hammered, containers opened/closed. Useful for anti-grief detection.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
}
