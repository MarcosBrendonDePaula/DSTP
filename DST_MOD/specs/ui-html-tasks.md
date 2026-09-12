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

### 2. Multi-line flex: `wrap` + `align-content`
- [ ] `layout_math`: break items into lines by the track (rts-dom `flex_linhas.rs`), `align-content` start/center/end/between/around/stretch, `row-gap`
- [ ] `LayoutChildren` uses it when `wrap` is set; reported box = all lines
- [ ] TS mirror + fixtures in `layout-math-fixtures.json`
- Tests: fixtures (both sides), harness (3 items in a 250px row wrap to 2 lines)

### 3. Text: `text-align`, `font`, `line-height`, wrap-by-width on any text
- [ ] `text` node: `align_text` (left/center/right), `font` enum (body/title/ui/outline/talking/small), `line_height`, `wrap:true` with `width` → `SetRegionSize` + `EnableWordWrap`
- [ ] parser: `text-align`, `font`, `line-height` style keys → props
- Tests: harness (Text gets SetHAlign/SetRegionSize/EnableWordWrap), parser mapping

### 4. Real grid: `grid-template-columns` with `fr`, per-axis gap, `span`
- [ ] `layout_math`: track sizing for `fr`/px/`%` columns, `column-gap`/`row-gap`, `grid-column: span N` (rts-dom `grid.rs`, `grid_linhas.rs`)
- [ ] `GridChildren` rewritten on it; legacy `cols` / `grid_rows` keep working
- Tests: fixtures + harness

### 5. `display: absolute` as a plain canvas container
- [ ] `absolute` maps to `col` + `mode:canvas` (not `panel` — no frame, no X); `style.background` honoured there
- [ ] preview mirror + `ui-element-model.test.ts`

### 6. HTML round-trip hygiene
- [ ] `treeToHtml` escapes `<`, `&`, `"` in text and attributes
- [ ] loose text inside a container becomes a `<text>` child instead of being dropped
- [ ] legacy `panel` survives tree → html → tree (title/closeable kept — `panel` tag, not `div`)
- Tests: parser round-trips

### 7. `hover` / `focus` as local rule events
- [ ] client emits `ui_hover` / `ui_focus` synthetic events (rules_engine INTERNAL_EVENTS) from the focus-based hit targets; `rule_install` can react (tint, tooltip)
- Tests: rules harness

### 8. Scrollable list: `overflow: scroll` + `height`
- [ ] `div` with `overflow:scroll` and a fixed height renders through DST `ScrollableList` (or a clipped viewport + wheel handler)
- Tests: harness (children beyond the height are parented to the scroller)

## Won't do (engine limits — see `ui-css-support.md`)
- [-] web fonts, arbitrary `border-radius`, gradients, `rotate`, `transition`/`animation` as style, real box-shadow, generic `overflow:hidden` clipping — no primitive in the Klei widget set
