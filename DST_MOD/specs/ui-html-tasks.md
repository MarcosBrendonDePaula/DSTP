# HTML/CSS UI engine — task board

Tracks what the in-game HTML/CSS renderer (`ui_widgets.lua` + `htmlParser.ts` +
`elementModel.ts` + `layout_math.lua`) still lacks, in the order we implement it.
Companion of `ui-css-support.md` (the *contract*) — this file is the *work*.
Update the status **in the same commit** that lands the item. Every item lands with a
red test first (fengari harness for Lua, jsdom for the parser, bun:test for the engine)
and a mutation check.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (commit) · `[-]` won't do (why)

## Done before this board (2026-09-12)
- [x] flex single line: direction/gap/justify(start,center,end,between,around,evenly)/align(start,center,end)/margin incl. `auto`/grow/shrink/min-max main axis/padding — `layout_math.lua` port of rts-dom (`086bb85`)
- [x] px / `%` sizes against parent, panel or screen; declared size is a minimum (`05d6dc4`, `dac6823`)
- [x] background, opacity, z-index, scale (`05d6dc4`, `a0bb440`)
- [x] `<tabs>` from HTML, boolean attributes, flat size attributes kept, panel content-box growth bug (`92c9153`)
- [x] `ui_track` mode all + templates + per-frame `bind`; data feed; entity channel; entity events → rules (`a4db278`…`0640f60`)

## Queue (in order)

### 1. Border via HTML + real `align: stretch` — DONE 2026-09-12
- [x] parser: `border: <width> <r,g,b,a>` (and `border-width` / `border-color`) → `{ width, color }`; Lua `AddBox` defaults the colour when only a width is given
- [x] preview: draws the border in `UIPreview`
- [x] `align: stretch` (col/row): a child with no explicit cross size is rendered at the container's cross content box (bars, buttons, inputs, nested cols fill the width); auto-sized containers can't stretch (nothing to stretch to)
- Tests: `htmlParser.client.test.ts` (border forms), `ui-layout-harness.lua` (frame image = box + 2·width; stretched bar = container content width; explicit width left alone)

### 2. Multi-line flex: `wrap` + `align-content` — DONE 2026-09-12
- [x] `layout_math` `LayoutLines`: greedy line breaking by the track (an item wider than the track gets its own line), per-line `LayoutLine`, `align_content` start/center/end/between/around/evenly/stretch (stretch = default with a fixed cross), `row_gap`
- [x] `LayoutChildren` calls it (`wrap`, `row_gap`, `align_content` props); reported box = all lines
- [x] TS mirror `layoutLines` + 7 fixtures; parser maps `flex-wrap`/`align-content`/`row-gap`; preview `flexWrap`
- Tests: fixtures (both sides), harness (3×100 in a 250 row → 2 lines, positions), parser mapping; mutation-checked (never-break)

### 3. Text: `text-align`, `font`, wrap-by-width — DONE 2026-09-12
- [x] `text` node: `halign`/`valign` accept CSS words (left/center/right, top/middle/bottom) or the DST constant names; `font` accepts friendly names (title/body/ui/outline/chat/talking/small/default) or the raw globals; a `width` already gives a region + word wrap
- [x] parser: `text-align` → `halign`, `vertical-align` → `valign`, `font` → `font`, `line-height` → `line_height`
- [-] `line-height`: parsed and carried, but the DST `Text` widget has no line-height API — ignored by the renderer (documented in `ui-css-support.md`)
- [ ] preview: `textAlign` for `halign` (the preview still centres text) — small follow-up
- Tests: harness (SetHAlign/SetVAlign from words, region + word wrap from width, legacy constant), parser mapping

### 4. Real grid: `grid-template-columns` with `fr`, per-axis gap, `span` — DONE 2026-09-12
- [x] `layout_math` `LayoutGrid` (Lua + TS, 8 fixtures): px / `fr` / `%` columns, `column_gap`/`row_gap`, `span` (an item that doesn't fit the rest of the row starts a new one), rows sized to the tallest item or `row_height`, `justify_items`/`align_items` per cell; without a track, fr/% columns size to their widest item
- [x] `GridChildrenCSS` in the mod when `grid_columns` is set; the legacy uniform `cols` / `grid_rows` grid keeps working; parser maps `grid-template-columns` / `column-gap` / `justify-items` / `grid-column: span N` (+ `align-items`, `justify-content`, `flex-direction` spellings); preview renders it as CSS grid
- Tests: fixtures (both sides), harness (2×1fr in 200 → positions), parser mapping; mutation-checked (span overflow, fr unit)

### 5. `display: absolute` as a plain canvas container — DONE 2026-09-12
- [x] `absolute` maps to `col` + `mode:canvas` (not `panel` — no frame, no X); `AddBox` now also runs on the canvas and grid branches, so `style.background`/`border` are honoured there
- [x] TS mirror (`elementModel.ts`) + `ui-element-model.test.ts`; harness: no close button, background drawn, child at `style.x/y`

### 6. HTML round-trip hygiene — DONE 2026-09-12
- [x] `treeToHtml` escapes `<`, `>`, `&`, `"` in text, attributes and style
- [x] loose text inside a container becomes a `<text>` child instead of being dropped
- [x] legacy `panel` survives tree → html → tree (`toElement` emits a `<panel>` tag, title/closeable/mode kept)
- [x] numeric style values (width/height/min/max/size/grow…) are coerced like attributes; `%` stays a string
- Tests: parser round-trips (escaping, loose text, panel identity)

### 7. `hover` / `focus` as local rule events
- [ ] client emits `ui_hover` / `ui_focus` synthetic events (rules_engine INTERNAL_EVENTS) from the focus-based hit targets; `rule_install` can react (tint, tooltip)
- Tests: rules harness

### 8. Scrollable list: `overflow: scroll` + `height`
- [ ] `div` with `overflow:scroll` and a fixed height renders through DST `ScrollableList` (or a clipped viewport + wheel handler)
- Tests: harness (children beyond the height are parented to the scroller)

### 9. HTML is the default authoring mode (owner's decision 2026-09-12) — DONE 2026-09-12 (palette + modal); code removal pending
- [x] `ui_builder` opens in HTML mode by default: `meta.defaults` seeds `ui_html` (`<panel title="Painel">…</panel>`) + the matching `tree`; a client test parses the HTML and asserts equality, so the two can't drift. The detail modal opens straight on the `</> Editor HTML` tab
- [x] Config has a 3-way mode chooser (HTML (padrão) / Visual / Estruturado). HTML → `ui_html` is the node's source of truth and the editor re-parses it into `data.tree` on every edit; switching to Visual/Estruturado drops `ui_html` (the synced tree becomes the truth); switching back serializes the tree with `treeToHtml`. `UITreeEditor` takes `forceCode` (host-owned mode: no local toggle / Aplicar / Cancelar)
- [x] `NodeMeta.legacy`: `ui_panel` (legacy + hidden — no longer offered) and `ui_menu` (legacy, "legado" badge in the palette) keep working for existing flows and are left out of the AI catalog (`isStandalone`)
- [ ] remove the `ui_panel` tree-assembly path once existing flows are migrated — NOTE `buildUITree` also serves `ui_track` (children primitives), so the primitives + `buildUITree` stay; only the `ui_panel` exec/ui go. `examples/flows/**` don't use `ui_panel`/`ui_menu` (checked 2026-09-12)
- Tests: `uiBuilderDefaults.client.test.ts` (HTML ↔ tree), `catalogSerializer.test.ts` (legacy excluded)

### 10. Micro-DOM: tree manipulation as rule actions (client-side, data not code)
- [x] `cb:` wildcard handles (2026-09-12): a tree button declared `callback="prefix:*"` exposes the handle `cb:prefix:*`, and ANY runtime click `prefix:<rest>` (buttons from `dom_append` / script HTML) starts the flow there with `{{trigger.callback_rest}}`; exact names win over the wildcard; the generic `ui_callback` trigger still catches everything. Test: `ui-callback-wildcard.test.ts`
- [x] `UIWidgets` micro-DOM (2026-09-12): the tree entry keeps its DEFINITION (`entry.tree` + the create `cmd`); `dom_append { id, parent?, node, index? }` / `dom_remove { id, node }` mutate the definition and REBUILD the tree in place (same id, same placement — `RebuildTree`); `dom_set { id, node, props }` / `dom_toggle { id, node, visible? }` patch the live node via `byId` AND persist into the definition (`visible=false` in a definition now starts hidden, so a rebuild keeps a toggled-off node off). Rebuild cost: text_input contents / tab selection reset — acceptable for v1
- [x] rules_engine actions `dom_set` / `dom_append` / `dom_remove` / `dom_toggle` → `UIWidgets.ProcessCommand` with the event templates resolved, no `seq` (would trip the dedup)
- [x] `ui_dom` node (backend): operation append (HTML → node via jsdom on the server) / remove / set (props JSON) / toggle; `dom_append` in a `ui_rule` may carry `html` — converted to `node` at `rule_install` time (`resolveRuleHtml`); the client never parses HTML
- [x] no client-side Lua/JS: the "script area" is the backend `script` node producing HTML for `ui_builder` (item 11); the client only interprets data (decision recorded 2026-09-12; see `dynamic-data-bindings.md` on why client Lua is out)
- Tests: `ui-dom.test.ts` (append/remove rebuild, set/toggle persist, placement survives, unknown ids no-op), `rules-dom.test.ts` (dom_* reach UIWidgets resolved), `ui_dom/exec.test.ts` (HTML → node, each op → its command)

### 11. Server-side DOM: edit the HTML in the flow before it renders (owner's ask 2026-09-12)
- [x] `ui_builder` accepts a runtime `html` param (`{{myscript.html}}`, 2026-09-12) — parsed on the backend with the same `htmlToTree` → `normalizeTree` (now in `app/shared/automation/ui/`, client files re-export) via jsdom's `DOMParser` (`app/server/live/ui/htmlToNode.ts`); wins over the static tree, invalid HTML falls back to it + `error`. Test: `ui_builder/exec-html.test.ts`
- [ ] `script` node context gets `dom(html)` → a jsdom `document` (querySelector/append/remove/setAttribute…) and `html(document)` back to a string; example flow: shop catalogue built from a list with `document.createElement`
- [x] jsdom is a runtime dependency (moved from devDependencies); loaded LAZILY on first HTML parse (~12ms per parse, ~0.3s first load), so boot pays nothing. Bundle size impact still to measure on `bun run build`
- [ ] Lua on the backend (fengari is already here) only if the owner prefers the syntax — JS is native to Bun
- Tests: engine e2e (script → html → ui_builder → tree pushed), parser round-trip under Bun (no browser DOMParser)

## Won't do (engine limits — see `ui-css-support.md`)
- [-] web fonts, arbitrary `border-radius`, gradients, `rotate`, `transition`/`animation` as style, real box-shadow, generic `overflow:hidden` clipping — no primitive in the Klei widget set
