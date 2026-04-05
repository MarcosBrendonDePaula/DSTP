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
    {
        name = "BACKEND_URL",
        label = "Backend URL",
        hover = "URL of the DSTP backend server.",
        options = {
            {description = "localhost:3000", data = "http://127.0.0.1:3000"},
            {description = "localhost:8080", data = "http://127.0.0.1:8080"},
        },
        default = "http://127.0.0.1:3000",
    },
    {
        name = "POLL_INTERVAL",
        label = "Poll Interval",
        hover = "How often to sync with the backend (in seconds).",
        options = {
            {description = "0.5s (Ultra)", data = 0.5},
            {description = "1s (Fast)", data = 1},
            {description = "2s", data = 2},
            {description = "5s (Default)", data = 5},
            {description = "10s", data = 10},
            {description = "30s (Slow)", data = 30},
        },
        default = 5,
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
        name = "EVT_HEALTH",
        label = "Events: Health Ticks",
        hover = "Track health/hunger/sanity changes. VERY HEAVY - only enable for debugging.",
        options = {{description = "On", data = true}, {description = "Off", data = false}},
        default = false,
    },
}
