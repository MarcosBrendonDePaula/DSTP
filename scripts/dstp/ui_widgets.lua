-- DSTP UI Widgets — Client-side widget rendering system
-- Backend sends JSON commands via net_string, client creates/updates/destroys widgets
-- All rendering happens CLIENT-SIDE only

local UIWidgets = {}

local _G = nil
local _seq = -1  -- last processed sequence number (dedup net_string replays)

-- Active widget registry: id -> { widget=, type=, parent=, task= }
local active_widgets = {}

-- Widget root (lazy-created, attached to HUD)
local _root = nil

-- Font name lookup
local FONT_MAP = nil

-------------------------------------------------
-- Helpers
-------------------------------------------------

local function Log(msg)
    print("[DSTP UI] " .. msg)
end

local function InitFontMap()
    FONT_MAP = {
        NEWFONT           = _G.NEWFONT,
        NEWFONT_OUTLINE   = _G.NEWFONT_OUTLINE,
        CHATFONT          = _G.CHATFONT,
        UIFONT            = _G.UIFONT,
        TITLEFONT         = _G.TITLEFONT,
        BODYTEXTFONT      = _G.BODYTEXTFONT,
        NEWFONT_SMALL     = _G.NEWFONT_SMALL,
        TALKINGFONT       = _G.TALKINGFONT,
    }
end

local function ResolveFont(name)
    if not name then return _G.NEWFONT_OUTLINE end
    if not FONT_MAP then InitFontMap() end
    return FONT_MAP[name] or _G.NEWFONT_OUTLINE
end

local function ResolveColor(c)
    if not c then return {1, 1, 1, 1} end
    return {c[1] or 1, c[2] or 1, c[3] or 1, c[4] or 1}
end

--- Get or create the widget root attached to the player HUD
local function GetRoot()
    if _root and _root.inst:IsValid() then return _root end

    local player = _G.ThePlayer
    if not player or not player.HUD or not player.HUD.controls then
        return nil
    end

    local Widget = _G.require("widgets/widget")
    _root = player.HUD.controls:AddChild(Widget("dstp_ui_root"))
    _root:SetHAnchor(_G.ANCHOR_MIDDLE)
    _root:SetVAnchor(_G.ANCHOR_MIDDLE)
    _root:SetScaleMode(_G.SCALEMODE_PROPORTIONAL)
    _root:MoveToFront()
    return _root
end

--- Resolve anchor name to x/y offset base from screen center
--- Returns base_x, base_y that positions a widget at that corner/edge
local function AnchorOffset(anchor_name)
    -- Screen half-extents (approximate for 1920x1080 in widget space ÷ 2)
    local hw, hh = 480, 270
    local map = {
        topleft      = {-hw,  hh},
        top          = {  0,  hh},
        topcenter    = {  0,  hh},
        topright     = { hw,  hh},
        left         = {-hw,   0},
        center       = {  0,   0},
        right        = { hw,   0},
        bottomleft   = {-hw, -hh},
        bottom       = {  0, -hh},
        bottomcenter = {  0, -hh},
        bottomright  = { hw, -hh},
    }
    local key = anchor_name and anchor_name:lower() or "center"
    local a = map[key] or map.center
    return a[1], a[2]
end

-------------------------------------------------
-- Widget Builders
-------------------------------------------------

--- NOTIFICATION — toast that auto-dismisses
local function CreateNotification(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Text   = _G.require("widgets/text")

    local w = root:AddChild(Widget("dstp_notif_" .. cmd.id))
    local col = ResolveColor(cmd.color)
    local font = ResolveFont(cmd.font)
    local size = cmd.size or 28

    local txt = w:AddChild(Text(font, size, cmd.text or ""))
    txt:SetColour(col[1], col[2], col[3], col[4])

    -- Position at top-center
    local ax, ay = AnchorOffset("top")
    w:SetPosition(ax + (cmd.x or 0), ay - 40 + (cmd.y or 0))

    -- Slide-in: start slightly above, tween down
    local startY = ay + 20 + (cmd.y or 0)
    local endY   = ay - 40 + (cmd.y or 0)
    w:SetPosition(ax + (cmd.x or 0), startY)
    w:MoveTo(_G.Vector3(ax + (cmd.x or 0), startY, 0),
             _G.Vector3(ax + (cmd.x or 0), endY,   0), 0.3)

    -- Auto-dismiss
    local duration = cmd.duration or 5
    local task = _G.ThePlayer:DoTaskInTime(duration, function()
        if w and w.inst:IsValid() then
            -- Fade out by just killing — DST widgets don't have great fade support
            w:Kill()
            active_widgets[cmd.id] = nil
        end
    end)

    return { widget = w, text = txt, type = "notification", task = task }
end

local function UpdateNotification(entry, cmd)
    if cmd.text and entry.text and entry.text.inst:IsValid() then
        entry.text:SetString(cmd.text)
    end
    if cmd.color and entry.text and entry.text.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.text:SetColour(c[1], c[2], c[3], c[4])
    end
end

--- LABEL — persistent HUD text
local function CreateLabel(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Text   = _G.require("widgets/text")

    local w = root:AddChild(Widget("dstp_label_" .. cmd.id))
    local col  = ResolveColor(cmd.color)
    local font = ResolveFont(cmd.font)
    local size = cmd.size or 20

    local txt = w:AddChild(Text(font, size, cmd.text or ""))
    txt:SetColour(col[1], col[2], col[3], col[4])

    local ax, ay = AnchorOffset(cmd.anchor)
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return { widget = w, text = txt, type = "label" }
end

local function UpdateLabel(entry, cmd)
    if cmd.text and entry.text and entry.text.inst:IsValid() then
        entry.text:SetString(cmd.text)
    end
    if cmd.color and entry.text and entry.text.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.text:SetColour(c[1], c[2], c[3], c[4])
    end
    if cmd.size and entry.text and entry.text.inst:IsValid() then
        entry.text:SetSize(cmd.size)
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor or "center")
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

--- PANEL — window with title and body
local function CreatePanel(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Text   = _G.require("widgets/text")
    local Image  = _G.require("widgets/image")
    local ImageButton = _G.require("widgets/imagebutton")

    local pw = cmd.width or 400
    local ph = cmd.height or 300

    local w = root:AddChild(Widget("dstp_panel_" .. cmd.id))

    -- Background using 9-slice panel image
    local bg = w:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
    bg:SetSize(pw, ph)
    bg:SetTint(0.1, 0.1, 0.1, 0.85)

    -- Border overlay
    local border = w:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
    border:SetSize(pw + 4, ph + 4)
    border:SetTint(0.3, 0.3, 0.4, 0.6)
    border:MoveToBack()

    -- Title
    local title_text = nil
    if cmd.title then
        title_text = w:AddChild(Text(_G.TITLEFONT, 24, cmd.title))
        title_text:SetColour(1, 1, 0.8, 1)
        title_text:SetPosition(0, ph / 2 - 25)
    end

    -- Body
    local body_text = nil
    if cmd.body then
        body_text = w:AddChild(Text(_G.BODYTEXTFONT, 18, cmd.body))
        body_text:SetColour(1, 1, 1, 1)
        body_text:SetRegionSize(pw - 40, ph - 80)
        body_text:SetHAlign(_G.ANCHOR_LEFT)
        body_text:SetVAlign(_G.ANCHOR_TOP)
        body_text:EnableWordWrap(true)
        body_text:SetPosition(0, -10)
    end

    -- Close button
    local close_btn = nil
    if cmd.closeable ~= false then
        close_btn = w:AddChild(ImageButton(
            "images/global_redux.xml",
            "close.tex", "close.tex", "close.tex", "close.tex"
        ))
        close_btn:SetPosition(pw / 2 - 15, ph / 2 - 15)
        close_btn:SetScale(0.4)
        close_btn:SetOnClick(function()
            -- A menu's panel + buttons share a `group`; closing the panel must
            -- tear down the whole group, not just the panel widget itself.
            if cmd.group then
                UIWidgets.DestroyGroup(cmd.group)
            else
                UIWidgets.DestroyWidget({ id = cmd.id })
            end
        end)
    end

    -- Position
    local ax, ay = AnchorOffset(cmd.anchor or "center")
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return {
        widget = w, type = "panel",
        title = title_text, body = body_text,
        close_btn = close_btn, bg = bg,
    }
end

local function UpdatePanel(entry, cmd)
    if cmd.title and entry.title and entry.title.inst:IsValid() then
        entry.title:SetString(cmd.title)
    end
    if cmd.body and entry.body and entry.body.inst:IsValid() then
        entry.body:SetString(cmd.body)
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor or "center")
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

--- BUTTON — clickable HUD button, sends callback event to backend
local function CreateButton(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget      = _G.require("widgets/widget")
    local Text        = _G.require("widgets/text")
    local ImageButton = _G.require("widgets/imagebutton")

    local w = root:AddChild(Widget("dstp_btn_" .. cmd.id))

    local btn = w:AddChild(ImageButton(
        "images/global_redux.xml",
        "button_carny_long_normal.tex",
        "button_carny_long_hover.tex",
        "button_carny_long_disabled.tex",
        "button_carny_long_down.tex"
    ))

    local bw = cmd.width or 200
    local bh = cmd.height or 50
    btn:SetScale(bw / 340, bh / 70)  -- base tex is ~340x70

    -- Label on button
    local label = w:AddChild(Text(_G.NEWFONT_OUTLINE, cmd.size or 22, cmd.text or "Button"))
    local col = ResolveColor(cmd.color)
    label:SetColour(col[1], col[2], col[3], col[4])

    -- Debounce: ignore repeat clicks on the same button within a short window.
    -- DST's ImageButton can fire OnClick more than once per real press, and an
    -- impatient player double-clicking a shop button would otherwise queue
    -- several ui_callback events (each a full flow run).
    local last_click = -1
    btn:SetOnClick(function()
        local now = _G.GetTime and _G.GetTime() or 0
        if last_click >= 0 and (now - last_click) < 0.5 then return end
        last_click = now
        if cmd.callback and UIWidgets._callback_fn then
            UIWidgets._callback_fn(cmd.callback, cmd.id)
        end
    end)

    local ax, ay = AnchorOffset(cmd.anchor)
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return { widget = w, btn = btn, label = label, type = "button", callback = cmd.callback }
end

local function UpdateButton(entry, cmd)
    if cmd.text and entry.label and entry.label.inst:IsValid() then
        entry.label:SetString(cmd.text)
    end
    if cmd.color and entry.label and entry.label.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.label:SetColour(c[1], c[2], c[3], c[4])
    end
    if cmd.callback then
        entry.callback = cmd.callback
        if entry.btn and entry.btn.inst:IsValid() then
            entry.btn:SetOnClick(function()
                if UIWidgets._callback_fn then
                    UIWidgets._callback_fn(cmd.callback, cmd.id)
                end
            end)
        end
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor)
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

--- PROGRESS_BAR — horizontal bar with optional label
local function CreateProgressBar(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Image  = _G.require("widgets/image")
    local Text   = _G.require("widgets/text")

    local bw = cmd.width or 200
    local bh = cmd.height or 20
    local value = math.max(0, math.min(cmd.value or 0, cmd.max or 1))
    local max_val = cmd.max or 1
    local pct = max_val > 0 and (value / max_val) or 0

    local w = root:AddChild(Widget("dstp_bar_" .. cmd.id))

    -- Background bar
    local bg_col = ResolveColor(cmd.bg_color or {0.2, 0.2, 0.2, 1})
    local bg = w:AddChild(Image("images/global.xml", "square.tex"))
    bg:SetSize(bw, bh)
    bg:SetTint(bg_col[1], bg_col[2], bg_col[3], bg_col[4])

    -- Foreground (fill) bar
    local fg_col = ResolveColor(cmd.color or {0, 1, 0, 1})
    local fg = w:AddChild(Image("images/global.xml", "square.tex"))
    local fill_w = math.max(1, bw * pct)
    fg:SetSize(fill_w, bh - 2)
    fg:SetTint(fg_col[1], fg_col[2], fg_col[3], fg_col[4])
    -- Offset fill to align left edge with bg left edge
    fg:SetPosition(-(bw - fill_w) / 2, 0)

    -- Label
    local label = nil
    if cmd.label then
        label = w:AddChild(Text(_G.NEWFONT_OUTLINE, math.min(bh - 2, 18), cmd.label))
        label:SetColour(1, 1, 1, 1)
    end

    local ax, ay = AnchorOffset(cmd.anchor)
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return {
        widget = w, type = "progress_bar",
        bg = bg, fg = fg, label = label,
        bar_width = bw, bar_height = bh,
        max_val = max_val,
    }
end

local function UpdateProgressBar(entry, cmd)
    local bw = entry.bar_width
    local bh = entry.bar_height
    local max_val = cmd.max or entry.max_val or 1

    if cmd.value and entry.fg and entry.fg.inst:IsValid() then
        local value = math.max(0, math.min(cmd.value, max_val))
        local pct = max_val > 0 and (value / max_val) or 0
        local fill_w = math.max(1, bw * pct)
        entry.fg:SetSize(fill_w, bh - 2)
        entry.fg:SetPosition(-(bw - fill_w) / 2, 0)
        entry.max_val = max_val
    end
    if cmd.color and entry.fg and entry.fg.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.fg:SetTint(c[1], c[2], c[3], c[4])
    end
    if cmd.label and entry.label and entry.label.inst:IsValid() then
        entry.label:SetString(cmd.label)
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor)
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

-------------------------------------------------
-- Dispatch tables
-------------------------------------------------

local CREATORS = {
    notification = CreateNotification,
    label        = CreateLabel,
    panel        = CreatePanel,
    button       = CreateButton,
    progress_bar = CreateProgressBar,
}

local UPDATERS = {
    notification = UpdateNotification,
    label        = UpdateLabel,
    panel        = UpdatePanel,
    button       = UpdateButton,
    progress_bar = UpdateProgressBar,
}

-------------------------------------------------
-- Public API
-------------------------------------------------

function UIWidgets.Init(env)
    _G = env.GLOBAL
    -- Optional: callback function for button clicks (set by modmain)
    UIWidgets._callback_fn = nil
end

--- Set the callback function that button widgets invoke
--- fn(callback_name, widget_id) — should send an event to the backend
function UIWidgets.SetCallbackHandler(fn)
    UIWidgets._callback_fn = fn
end

function UIWidgets.CreateWidget(cmd)
    if not cmd.id or not cmd.type then
        Log("create: missing id or type")
        return
    end

    -- Destroy existing widget with same id
    if active_widgets[cmd.id] then
        UIWidgets.DestroyWidget({ id = cmd.id })
    end

    local creator = CREATORS[cmd.type]
    if not creator then
        Log("create: unknown widget type '" .. tostring(cmd.type) .. "'")
        return
    end

    local entry = creator(cmd)
    if entry then
        entry.group = cmd.group
        active_widgets[cmd.id] = entry
        Log("created " .. cmd.type .. " '" .. cmd.id .. "'")
    end
end

--- Destroy every widget tagged with the given group (e.g. a whole menu).
function UIWidgets.DestroyGroup(group)
    if not group then return end
    local ids = {}
    for id, entry in pairs(active_widgets) do
        if entry.group == group then table.insert(ids, id) end
    end
    for _, id in ipairs(ids) do
        UIWidgets.DestroyWidget({ id = id })
    end
    Log("destroyed group '" .. tostring(group) .. "' (" .. #ids .. " widgets)")
end

function UIWidgets.UpdateWidget(cmd)
    if not cmd.id then
        Log("update: missing id")
        return
    end

    local entry = active_widgets[cmd.id]
    if not entry then
        -- If widget doesn't exist yet and full create data is provided, create it
        if cmd.type then
            UIWidgets.CreateWidget(cmd)
        else
            Log("update: widget '" .. cmd.id .. "' not found")
        end
        return
    end

    local updater = UPDATERS[entry.type]
    if updater then
        updater(entry, cmd)
    end
end

function UIWidgets.DestroyWidget(cmd)
    if not cmd.id then return end
    local entry = active_widgets[cmd.id]
    if not entry then return end

    -- Cancel any pending tasks (e.g. notification auto-dismiss)
    if entry.task then
        entry.task:Cancel()
    end

    -- Kill the widget tree
    if entry.widget and entry.widget.inst:IsValid() then
        entry.widget:Kill()
    end

    active_widgets[cmd.id] = nil
    Log("destroyed '" .. cmd.id .. "'")
end

function UIWidgets.ClearAll()
    local ids = {}
    for id, _ in pairs(active_widgets) do
        table.insert(ids, id)
    end
    for _, id in ipairs(ids) do
        UIWidgets.DestroyWidget({ id = id })
    end
    Log("cleared all widgets")
end

function UIWidgets.ProcessCommand(cmd)
    if not cmd or not cmd.action then
        Log("invalid command (no action)")
        return
    end

    -- Sequence-based dedup: skip if we already processed this seq
    if cmd.seq then
        if cmd.seq <= _seq then return end
        _seq = cmd.seq
    end

    if cmd.action == "create" then
        UIWidgets.CreateWidget(cmd)
    elseif cmd.action == "update" then
        UIWidgets.UpdateWidget(cmd)
    elseif cmd.action == "destroy" then
        UIWidgets.DestroyWidget(cmd)
    elseif cmd.action == "destroy_group" then
        UIWidgets.DestroyGroup(cmd.group)
    elseif cmd.action == "clear" then
        UIWidgets.ClearAll()
    elseif cmd.action == "batch" then
        -- Process multiple commands in one net_string payload
        if cmd.commands then
            for _, sub_cmd in ipairs(cmd.commands) do
                UIWidgets.ProcessCommand(sub_cmd)
            end
        end
    else
        Log("unknown action '" .. tostring(cmd.action) .. "'")
    end
end

--- Get count of active widgets (for debugging)
function UIWidgets.GetActiveCount()
    local count = 0
    for _ in pairs(active_widgets) do count = count + 1 end
    return count
end

return UIWidgets
