# Lua type-assumption bug sweep

> Saved from workflow `Sweep the DSTP mod Lua for type-assumption bugs like the numeric-text crash`. Raw multi-agent research output;
> see the sibling specs for the distilled conclusions.

## rawCount
46

## triage

- **realBugs:** 
  **1.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/rules_engine.lua
    - **line:** 184
    - **code:** if not conditions or #conditions == 0 then return true end  ... for _, c in ipairs(conditions) do
    - **why:** conditions = rule.when.conditions comes from the author's free-form rule JSON (ui_rule node `rules` param), JSON.parse'd by the backend (FlowEngine.ts:973) with ZERO per-field type validation. A typo like {"when":{"event":"x","conditions":5}} makes conditions a number; `not conditions` only guards nil/false, so `#5` raises 'attempt to get length of a number value'. EvalConditions runs from HandleEvent (line 289) with NO pcall (the per-action pcall is only inside ExecuteActions), so it propagates out of the client event listener = client crash when the event fires.
    - **severity:** crash
    - **fix:** Guard the type: `if type(conditions) ~= 'table' then return true end` before #conditions.
  **2.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/rules_engine.lua
    - **line:** 142
    - **code:** local field = cond.field or ""  ... if field:find("%.") or field == "event" ... then ... field:sub(1, 6) ...
    - **why:** cond.field is author-controlled rule JSON (un-validated, see above). `cond.field or ""` only defends nil; a number/table passes through and `field:find`/`field:sub` index a non-string -> 'attempt to index a number value (method find)'. EvalCondition runs inside HandleEvent's non-pcall path (line 289->186), so it crashes the client-side event listener when the rule's event fires.
    - **severity:** crash
    - **fix:** Coerce: `local field = cond.field; if type(field) ~= 'string' then field = '' end` (or tostring) before the :find/:sub calls.
  **3.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/rules_engine.lua
    - **line:** 264
    - **code:** local function ExecuteActions(actions, event_data)  if not actions then return end  for _, a in ipairs(actions) do
    - **why:** actions = rule['do'] from the author's rule JSON (un-validated). `if not actions` only catches nil/false; a scalar (number/string) passes and `ipairs(actions)` raises 'table expected, got number'. This ipairs is BEFORE the per-action pcall (line 267), and ExecuteActions itself is called from HandleEvent (line 290) with no surrounding pcall -> client crash when the event fires.
    - **severity:** crash
    - **fix:** Add `if type(actions) ~= 'table' then return end` after the nil check.
  **4.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 667
    - **code:** local value = math.max(0, math.min(node.value or 0, node.max or 1))
    - **why:** On the ui_builder literal-tree path, leaf props are resolved by resolveTree (FlowEngine.ts:825) which resolves {{templates}} but does NOT numeric-coerce (unlike buildUITree's num()). A bar with value/max bound to a template that resolves to a non-numeric string ('', '50%', 'N/A') or table reaches RenderNode raw; math.min raises 'bad argument (number expected, got string)'. RenderNode runs via the ui_command dispatch (modmain dstp_ui_dirty listener) with NO pcall -> client crash on first render. Note the UPDATE path (line 688-690) already tonumber-guards this; the CREATE path is the un-hardened twin.
    - **severity:** crash
    - **fix:** Wrap with tonumber like the update path: `local v = tonumber(node.value) or 0; local mx = tonumber(node.max) or 1; local value = math.max(0, math.min(v, mx))` and use mx for maxv at 668.
  **5.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 676
    - **code:** local bw = node.width or 200 ... local fillw = math.max(1, bw * pct) ... bg:SetSize(bw, bh) ... bh = node.height or 16 ... math.min(bh - 2, 18)
    - **why:** Same ui_builder/resolveTree un-coerced path as line 667. A bar width/height bound to a template resolving to a non-numeric string ('200px', '') makes `bw * pct` / `bh - 2` raise 'attempt to perform arithmetic on a string value'. Uncontained (ui_command dispatch has no pcall). bh-2 at 682 only triggers when node.label is set.
    - **severity:** crash
    - **fix:** Coerce once at the top of the bar branch: `local bw = tonumber(node.width) or 200; local bh = tonumber(node.height) or 16`.
  **6.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 507
    - **code:** activate((node.active or 0) + 1)
    - **why:** node.active on a tabs node is num()-coerced by buildUITree (line 806) but the ui_builder/resolveTree literal-tree path leaves it raw. A template resolving to a non-numeric string/bool makes `(node.active or 0) + 1` raise 'attempt to perform arithmetic'. A numeric string ('1') silently coerces but selects the wrong tab. Uncontained via ui_command dispatch.
    - **severity:** crash
    - **fix:** Coerce: `activate((tonumber(node.active) or 0) + 1)`.
  **7.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 251
    - **code:** for _, childdef in ipairs(node.children or {}) do
    - **why:** In resolveTree (ui_builder), `children` is only recursed as an array when Array.isArray; a tree authored with `"children": "{{x}}"` is resolved by the string branch (FlowEngine.ts:833) and can become a non-array value. `node.children or {}` only guards nil, so a number/string makes `ipairs` raise 'table expected, got number'. Reached by every col/row and by panel content (lines 733/736). Uncontained via ui_command dispatch.
    - **severity:** crash
    - **fix:** `for _, childdef in ipairs(type(node.children) == 'table' and node.children or {}) do`.
  **8.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 447
    - **code:** local tabs = node.tabs or {}  ... for i, tab in ipairs(tabs) do  ... #tabs (470)
    - **why:** Same resolveTree exposure as children: a tabs node authored with `tabs` bound to a template can resolve to a non-table. `node.tabs or {}` guards nil only; `ipairs(tabs)`/`#tabs` on a number/string crashes. Uncontained via ui_command dispatch.
    - **severity:** crash
    - **fix:** `local tabs = type(node.tabs) == 'table' and node.tabs or {}`.
  **9.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 528
    - **code:** local w = (rw and rw > 0) and rw or (txtlen * (node.size or 18) * 0.5)   (also 534)
    - **why:** text node.size is num()-coerced in buildUITree (line 752) but raw on the ui_builder/resolveTree path. On the fallback branch (GetRegionSize returns 0/nil, e.g. empty text) `txtlen * node.size` and math.max(w, ...) at 534 run; a non-numeric size string/table raises 'number expected'. The sibling #text crash two lines up was already hardened with tostring; size has the same un-coerced exposure. Uncontained via ui_command dispatch.
    - **severity:** crash
    - **fix:** Compute size once: `local sz = tonumber(node.size) or 18` and use sz at 528/529/534.
  **10.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 516
    - **code:** if node.wrap_width then txt:SetRegionSize(node.wrap_width, node.wrap_height or 60) end
    - **why:** wrap_width/wrap_height are num()-coerced in buildUITree (line 754) but raw on the ui_builder/resolveTree path. SetRegionSize is a native C call expecting numbers; a non-empty non-numeric wrap_width string passes the truthiness `if` and then raises a C-side 'bad argument (number expected)'. Uncontained via ui_command dispatch.
    - **severity:** crash
    - **fix:** `if node.wrap_width then txt:SetRegionSize(tonumber(node.wrap_width) or 0, tonumber(node.wrap_height) or 60) end`.
  **11.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 716
    - **code:** local fixed = node.width ~= nil and node.height ~= nil ... pw, ph = node.width, node.height ... ph / 2 - 25 (720), pw - 40 (725), pw + 4 (742)
    - **why:** Fixed-mode panel width/height are num()-coerced in buildUITree (line 745) but raw on the ui_builder/resolveTree path. The `fixed` gate only checks ~= nil, so a width/height resolving to a non-numeric string enters fixed mode and `ph/2-25`/`pw-40` raise 'attempt to perform arithmetic on a string value' (and bg:SetSize at 741 is a native setter). Uncontained via ui_command dispatch.
    - **severity:** crash
    - **fix:** Coerce in the fixed branch: `pw, ph = tonumber(node.width), tonumber(node.height)` and gate `fixed` on both being non-nil after coercion.
  **12.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 738
    - **code:** pw = math.max(node.min_width or 160, cw + padX * 2)  ph = math.max(node.min_height or 80, ch + padY * 2)
    - **why:** buildUITree never emits min_width/min_height, so any value is author-provided via the ui_builder literal tree (resolveTree, un-coerced). A non-numeric min_width/min_height string/table makes math.max raise 'bad argument (number expected, got string)'. cw/ch are internally computed and fine. Uncontained via ui_command dispatch.
    - **severity:** crash
    - **fix:** `pw = math.max(tonumber(node.min_width) or 160, cw + padX * 2)` and likewise for ph/min_height.
  **13.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 682
    - **code:** barlabel = holder:AddChild(Text(_G.NEWFONT_OUTLINE, math.min(bh - 2, 18), tostring(node.label)))
    - **why:** Same bar node.height exposure as line 676, specifically the inline-label branch. When node.label is set and node.height (ui_builder/resolveTree) is a non-numeric string, `bh - 2` raises 'attempt to perform arithmetic' before math.min runs. Fixed by the same `local bh = tonumber(node.height) or 16` coercion suggested for line 676.
    - **severity:** crash
    - **fix:** Covered by coercing bh once at the top of the bar branch (`local bh = tonumber(node.height) or 16`).
  **14.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/ui_widgets.lua
    - **line:** 46
    - **code:** local function ResolveColor(c) if not c then return {1,1,1,1} end return {c[1] or 1, c[2] or 1, c[3] or 1, c[4] or 1} end
    - **why:** Color props are coerced to arrays-or-undefined by buildUITree's color() helper, but on the ui_builder/resolveTree path a color bound to a template can resolve to a NUMBER or BOOLEAN. `if not c` only guards nil/false; indexing `c[1]` on a number/bool raises 'attempt to index a number value'. (A string does NOT crash — Lua string metatable returns nil -> silently white.) Called from ~15 sites; reached via the un-pcall'd ui_command dispatch.
    - **severity:** crash
    - **fix:** `if type(c) ~= 'table' then return {1,1,1,1} end` at the top of ResolveColor.
  **15.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/core.lua
    - **line:** 327
    - **code:** if c.action == "batch" and c.commands then for _, s in ipairs(c.commands) do table.insert(ui_by_user[uid], s) end
    - **why:** c is a ui_command sub from a flow's ui_command node payload (author-influenced). If an author/AI sends { action='batch', commands=<scalar> } the truthiness check passes and ipairs(c.commands) raises 'table expected'. Core.ProcessCommands runs in the QueryServer poll callback (http.lua:115) with NO pcall, so it breaks that poll cycle's command processing. Server-side and lower-frequency than the client UI bugs, but a real unguarded ipairs on author data.
    - **severity:** wrong-behavior
    - **fix:** `if c.action == 'batch' and type(c.commands) == 'table' then`.
  **16.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/commands.lua
    - **line:** 729
    - **code:** local days = data.days or 1  for i = 1, days do _G.TheWorld:PushEvent("ms_nextcycle") end
    - **why:** days = data.days from the skip_day command (flow field), used as a for-loop upper bound with no tonumber. A template resolving to a non-numeric string ('all','') or table raises "'for' limit must be a number". CONTAINED by Core.ExecuteCommand's pcall (core.lua:229), so it logs and the command silently no-ops rather than crashing the sim — wrong-behavior, not crash. Even a numeric string like '3' as the for-limit errors in Lua 5.1 (for-limits are not string-coerced), so any string value fails.
    - **severity:** wrong-behavior
    - **fix:** `local days = tonumber(data.days) or 1`.
  **17.** 
    - **file:** E:/DSTP/DST_MOD/scripts/dstp/commands.lua
    - **line:** 764
    - **code:** local count = data.count or 1  if count > 1 and ent.components.stackable then ent.components.stackable:SetStackSize(count) end
    - **why:** count = data.count (spawn_prefab flow field) compared with `count > 1` with no tonumber. Lua 5.1 never coerces in relational ops, so even a numeric string '5' raises 'attempt to compare string with number', and a table/bool likewise. CONTAINED by Core.ExecuteCommand's pcall, so the entity spawns but the stack-size step silently fails (the sibling spawn_at_player at line 793 already uses tonumber(data.count)). Wrong-behavior, not a crash.
    - **severity:** wrong-behavior
    - **fix:** `local count = tonumber(data.count) or 1`.
- **falsePositives:** 
  - ui_widgets.lua:95 anchor_name:lower() on a number — FALSE POSITIVE. anchor is passed to the client as rc.param('anchor','center') (FlowEngine.ts, ui_builder/ui_panel exec), which returns the RAW, UNRESOLVED param value. It is never run through resolveValue+num() to become a number anywhere. So anchor reaches AnchorOffset as either a literal string ('top') or an unresolved '{{...}}' string — always a string; ':lower()' is safe and falls back to map.center. A number/table can't reach it.
  - ui_widgets.lua:139/144/147-151 CreateNotification cmd.text/cmd.x/cmd.y/cmd.size/cmd.duration — FALSE POSITIVE. The flat ui_notification action (FlowEngine.ts:860) sends ONLY { text, duration:Number()||5 }; it never passes x/y/size, so cmd.x/cmd.y/cmd.size are nil and the `or 0`/`or 28` defaults apply. text is a string (action text). Notification is not reachable from the un-coerced ui_builder tree path.
  - ui_widgets.lua:144-151 / FlatAdapter offsets via ui_label/ui_panel — FALSE POSITIVE. The flat label/panel/progress_bar actions coerce x/y/width/height/value with `Number(...) || default` (FlowEngine.ts:862-885) before sending, so non-numeric inputs become the numeric default, not a bad string.
  - buildUITree structured-node path for value/max/width/height/size/active (ui_panel + ui_* primitives) — FALSE POSITIVE. buildUITree coerces every numeric field via num() (FlowEngine.ts:727,745-806) which returns undefined (-> Lua nil) for non-numbers, so the Lua `or default` guards catch them. The real exposure is ONLY the ui_builder literal-tree (resolveTree) path, which is what the real-bug entries target.
  - rules_engine.lua:443 ipairs(cmd.rules) and 449/466 — FALSE POSITIVE. The backend rule_install handler JSON.parses the `rules` string and forces an array: `if (!Array.isArray(rules)) rules = [rules]` (FlowEngine.ts:973-975). cmd.rules / cmd.ids / cmd.commands therefore always arrive as tables. (The CONTENTS of each rule — field/conditions/do — are un-validated; those are the real bugs at lines 142/184/264.)
  - commands.lua:919 (and 958) #data.rules in the debug log — FALSE POSITIVE. data.rules is the backend-parsed array (always a table, see above), the log is gated behind DSTP._DEBUG, and install_rules runs via Core.ExecuteCommand's pcall anyway. No realistic crash.
  - commands.lua:633 teleport SetPosition(data.x,0,data.z) and 759/773/841 spawn_prefab/remove_near/destroy_structure coords — DOWNGRADED, not a crash. These are server commands run via Core.ExecuteCommand which wraps the handler in pcall (core.lua:229); a non-numeric coord raises a contained, logged error and the action silently no-ops. Real per-command Lua error but never a sim crash; effectively wrong-behavior at most, and the coords usually arrive numeric.
  - land_claims.lua:89/90 %d format and x/z storage — FALSE POSITIVE (latent/low only). The only live caller (commands.lua claim_add -> ResolveXZ) tonumber()s data.x/data.z (or uses the player's numeric world position) and the `if owner and x and z` filters drop nil from a failed tonumber, so x/z reaching Add are numeric. The Log %d is also DEBUG-gated. Only a hypothetical future direct LandClaims.Add caller with raw x/z would break it.
  - http.lua:113 #data.commands and core.lua command-array entry — FALSE POSITIVE (low). data.commands is produced by the trusted backend /dst/sync response, which always returns an array; a malformed non-array would require a backend regression. Not flow/event-author reachable.
  - rules_engine.lua:1133 / ui_widgets.lua:1133 cmd.seq <= _seq comparison — FALSE POSITIVE. seq is always stamped by the backend as Date.now() (a JS number) on every UI/rules envelope (FlowEngine.ts ui_menu/ui_builder/ui_panel/rule_install all set seq: Date.now()); it is never author-templated. JSON-decoded numbers stay Lua numbers, so the relational compare never sees a string.
  - ui_widgets.lua:498 tab.label and 513/586 button/text labels — covered/low. Labels are wrapped with tostring() at the render sites (513, 586, 718, 723) or String()'d on the backend (buildUITree tab label line 809, button text line 765); tab.label at 498 is the one un-tostring'd Text() arg but numbers stringify in DST's Text and a table label is an unlikely author shape — at most low, not a realistic crash.
- **summary:** Deduped 44 candidates to 17 real findings. The decisive factor is the data path + pcall coverage. THREE delivery paths feed the Lua UI/rules code: (1) structured ui_* nodes -> buildUITree, which num()-coerces every numeric field (non-numbers become nil, caught by Lua `or` defaults) — these candidates are FALSE POSITIVES; (2) legacy flat ui_* actions, coerced via Number(...)||default — also FALSE POSITIVES; (3) the ui_builder literal tree -> resolveTree, which resolves {{templates}} but does NOT numeric-coerce, AND the ui_rule rule JSON, which the backend JSON.parses but does NOT validate field-by-field. Path (3) is the real exposure. 14 crashes: 3 in rules_engine.lua (field/conditions/do type bugs at 142/184/264 — these run in the non-pcall client event-listener path, so they crash the client when the rule's event fires) and 11 in ui_widgets.lua (bar value/max/width/height, text size, wrap_width, tabs active, panel fixed/min_* sizing, children/tabs non-table, ResolveColor on a number — all reachable raw via the ui_builder tree through the un-pcall'd ui_command dispatch in modmain's dstp_ui_dirty listener). 3 wrong-behavior: core.lua:327 batch ipairs on author data, and commands.lua skip_day(729)/spawn_prefab count(764) which are contained by Core.ExecuteCommand's pcall (silent no-op, not a sim crash). Ruled out: the anchor:lower() claim (anchor is always a raw unresolved STRING via rc.param, never a number), all server-command SetPosition/FindEntities coord claims (pcall-contained -> at most wrong-behavior, and usually numeric), cmd.rules/cmd.ids ipairs (backend forces an array), all seq comparisons (seq is always a backend Date.now() number), land_claims %d (DEBUG-gated + ResolveXZ tonumbers), and every buildUITree/flat-path numeric field (already num()/Number()-coerced). Fixes are uniformly one-liners: tonumber() for arithmetic sites, type(x)=='table' guards for ipairs/#/index sites, mirroring the hardening already present on the bar UPDATE path (688-690) and the #text fix (527).
