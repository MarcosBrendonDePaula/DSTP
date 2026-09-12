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

### 4. Real grid: `grid-template-columns` with `fr`, per-axis gap, `span`
- [ ] `layout_math`: track sizing for `fr`/px/`%` columns, `column-gap`/`row-gap`, `grid-column: span N` (rts-dom `grid.rs`, `grid_linhas.rs`)
- [ ] `GridChildren` rewritten on it; legacy `cols` / `grid_rows` keep working
- Tests: fixtures + harness

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

## Won't do (engine limits — see `ui-css-support.md`)
- [-] web fonts, arbitrary `border-radius`, gradients, `rotate`, `transition`/`animation` as style, real box-shadow, generic `overflow:hidden` clipping — no primitive in the Klei widget set
