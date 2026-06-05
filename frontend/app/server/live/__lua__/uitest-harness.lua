-- Meta-test for the in-game UI smoke test (uitest.lua). Runs the REAL uitest.lua with
-- real core.lua under fengari: asserts #uitest enqueues the expected widgets, the
-- click tap logs uitest: callbacks (and ONLY those), and #uitest clear tears the group
-- down. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local mock_G = KIT.make_G({ AllPlayers = { { userid = "admin1", name = "Admin" } } })
local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(mock_G, KIT.fake_json, { server_id = "s", max_batch_size = 50 })

-- Capture ui_command envelopes (what would hit the net_string) + LogInfo lines.
local sent = {}        -- list of cmds sent via ui_command
local logs = {}
Core.LogInfo = function(m) logs[#logs + 1] = tostring(m) end
Core.RegisterCommand("ui_command", function(data) sent[#sent + 1] = data.cmd end)

local UITest = KIT.load(MOD_UITEST, "uitest.lua")
UITest.Init(Core)

-- Run the UI test for admin1.
UITest.Run("admin1")

-- It clears first (destroy_group), then sends ONE batched ui_command with 7 create
-- sub-commands (coalesced so the single-value net_string doesn't clobber them — #3).
local creates, destroys = 0, 0
local ids = {}
local function scanCmd(cmd)
    if not cmd then return end
    if cmd.action == "batch" and cmd.commands then
        for _, sub in ipairs(cmd.commands) do scanCmd(sub) end
    elseif cmd.action == "create" then
        creates = creates + 1; ids[cmd.id] = true
    elseif cmd.action == "destroy_group" then
        destroys = destroys + 1
    end
end
local batchCount = 0
for _, cmd in ipairs(sent) do
    if cmd.action == "batch" then batchCount = batchCount + 1 end
    scanCmd(cmd)
end
check("uitest: widgets sent as ONE batch (no clobber)", batchCount == 1)
check("uitest: 7 widgets created", creates == 7)
check("uitest: clickable button present", ids["uitest_button"] == true)
check("uitest: clickable text present (#16)", ids["uitest_text"] == true)
check("uitest: clickable icon present (#16)", ids["uitest_icon"] == true)
check("uitest: clickable image present (#16)", ids["uitest_image"] == true)

-- Each clickable tree carries a uitest: callback on its node. Search inside the batch.
local function findCmd(id)
    for _, c in ipairs(sent) do
        if c.action == "batch" and c.commands then
            for _, sub in ipairs(c.commands) do if sub.id == id then return sub end end
        elseif c.id == id then
            return c
        end
    end
end
local btn = findCmd("uitest_button")
check("uitest: button node has uitest:button callback", btn and btn.tree and btn.tree.callback == "uitest:button")
local txt = findCmd("uitest_text")
check("uitest: text node has uitest:text callback", txt and txt.tree and txt.tree.callback == "uitest:text")

-- ── The click tap: a ui_callback with a uitest: callback logs "UITEST CLICK" ──
logs = {}
Core.PushEvent("ui_callback", { name = "Admin", callback = "uitest:button" })
local logged = false
for _, l in ipairs(logs) do if l:find("UITEST CLICK") and l:find("uitest:button") then logged = true end end
check("tap: uitest click is logged", logged)

-- ── A NON-uitest ui_callback is NOT logged by the tap (passes through clean) ──
logs = {}
Core.PushEvent("ui_callback", { name = "Admin", callback = "shop:buy" })
local leaked = false
for _, l in ipairs(logs) do if l:find("UITEST CLICK") then leaked = true end end
check("tap: non-uitest click NOT logged", not leaked)

-- ── The tap still forwards the event (queue grew) — it wraps, doesn't swallow ──
local qn = #Core.state.event_queue
Core.PushEvent("ui_callback", { name = "Admin", callback = "uitest:text" })
check("tap: event still forwarded to the queue", #Core.state.event_queue == qn + 1)

-- ── #uitest clear sends a destroy_group ──
sent = {}
UITest.Clear("admin1")
local cleared = false
for _, c in ipairs(sent) do if c.action == "destroy_group" and c.group == "dstp_uitest" then cleared = true end end
check("clear: destroy_group sent", cleared)

return C.report()
