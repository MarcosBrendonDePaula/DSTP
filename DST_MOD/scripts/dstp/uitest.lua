-- DSTP UI Self-Test — in-game VISUAL smoke test for the widget renderer (#16).
--
-- Triggered by an admin typing `#uitest` (see chat.lua). Creates one of EACH widget
-- on the admin's HUD — label, panel, progress_bar, a real button, and the #16
-- fix: clickable text / icon / image — each tagged with what you should SEE. Clicking
-- any clickable logs "UITEST CLICK: <id>" to the server log (and the admin sees it via
-- the normal ui_callback path), so you can confirm in runtime that the transparent
-- ImageButton overlay actually delivers clicks on text/icon/image.
--
-- `#uitest clear` removes them. A "mechanic module": M.Init(core) + M.Run(userid) +
-- M.Clear(userid). It taps core.PushEvent ONCE to log uitest: callbacks, then leaves
-- everything else untouched.

local M = {}

local core
local GROUP = "dstp_uitest"
local tapped = false

function M.Init(c)
    core = c
    return M
end

-- Accumulate widget-create sub-commands, then flush them as ONE batched ui_command.
-- A player's _dstp_ui net_string holds a SINGLE value, so sending 7 separate
-- ui_commands in one frame would clobber each other (only the last survives — exactly
-- the #3 bug). We coalesce them into one {action="batch"} envelope the client fans out.
local _pending = nil
local function send(id, tree, anchor, x, y)
    _pending[#_pending + 1] = { action = "create", id = id, group = GROUP, type = "tree",
        tree = tree, anchor = anchor, x = x, y = y }
end
local function flush(userid)
    if not _pending or #_pending == 0 then return end
    core.ExecuteCommand({ type = "ui_command", data = {
        userid = userid,
        cmd = { action = "batch", seq = (core._G.GetTime and core._G.GetTime() or 0), commands = _pending },
    } })
    _pending = nil
end

-- Install a one-time tap on PushEvent so a uitest: click logs visibly. We wrap the
-- real PushEvent; non-uitest events pass through untouched.
local function ensureTap()
    if tapped then return end
    tapped = true
    local real = core.PushEvent
    core.PushEvent = function(event_type, data, raw)
        if event_type == "ui_callback" and data and type(data.callback) == "string"
            and data.callback:sub(1, 7) == "uitest:" then
            core.LogInfo("UITEST CLICK: " .. data.callback .. " (player " .. tostring(data.name) .. ")")
        end
        return real(event_type, data, raw)
    end
end

function M.Run(userid)
    ensureTap()
    M.Clear(userid)  -- start fresh
    _pending = {}

    -- 1) LABEL — plain HUD text, top.
    send("uitest_label",
        { type = "text", text = "[UITEST] label - voce ve este texto no topo", size = 22, color = { 1, 1, 0.4, 1 } },
        "top", 0, -60)

    -- 2) PROGRESS BAR with inline label, top-left.
    send("uitest_bar",
        { type = "bar", width = 220, height = 22, value = 7, max = 10, label = "[UITEST] barra 70%",
          color = { 0.2, 0.9, 0.2, 1 } },
        "left", 160, 120)

    -- 3) PANEL with title + body (fixed size), center-left. DRAGGABLE: grab the title
    -- bar and move it; the close X stays clickable.
    send("uitest_panel",
        { type = "panel", width = 360, height = 200, draggable = true,
          title = "[UITEST] painel (arraste o topo)", body = "Janela arrastavel: segure o topo e mova; o X fecha. Arrastar + fechar OK = sistema de janela validado." },
        "center", -260, 0)

    -- 4) BUTTON — real clickable button, center.
    send("uitest_button",
        { type = "button", text = "[UITEST] CLIQUE AQUI (button)", width = 280, height = 50,
          callback = "uitest:button" },
        "center", 0, 60)

    -- 5) CLICKABLE TEXT — the #16 fix (text is not focusable; overlay makes it click).
    -- Pass hit_debug=true on any node to tint its clickable region red (calibration).
    send("uitest_text",
        { type = "text", text = "[UITEST] CLIQUE neste TEXTO (#16)", size = 24, color = { 0.6, 0.9, 1, 1 },
          callback = "uitest:text" },
        "center", 0, 0)

    -- 6) CLICKABLE ICON — item atlas (log), the #16 fix on an icon.
    send("uitest_icon",
        { type = "icon", prefab = "log", size = 64, callback = "uitest:icon" },
        "center", 0, -70)

    -- 7) CLICKABLE IMAGE — a plain square, the #16 fix on an image.
    send("uitest_image",
        { type = "image", tex = "square.tex", width = 64, height = 64, tint = { 1, 0.5, 0.2, 1 },
          callback = "uitest:image" },
        "center", 120, -70)

    flush(userid)  -- ONE batched net_string set (no clobber)

    core.LogInfo("===== DSTP UI-TEST: widgets criados para " .. tostring(userid) ..
        " — clique em button/text/icon/image; cada clique loga 'UITEST CLICK'. #uitest clear remove. =====")
end

function M.Clear(userid)
    -- Destroy the whole group on the player's HUD.
    core.ExecuteCommand({ type = "ui_command", data = {
        userid = userid,
        cmd = { action = "destroy_group", group = GROUP },
    } })
end

return M
