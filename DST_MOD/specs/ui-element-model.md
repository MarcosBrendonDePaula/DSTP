# DSTP UI — Element Model (HTML/CSS-like) — DESIGN SPEC

Status: **design / not yet implemented.** This is the target model for the UI tree —
an HTML/CSS-shaped redesign of `ui-system.md`'s ad-hoc node types. Built on branch
`feat/html-ui-engine`. It will **coexist** with the legacy node types (col/row/panel/…)
via an adapter, so existing flows keep working while new UIs use this model.

## Why

Today every node type (panel/col/row/text/button/icon/bar/…) has its own props and its
own renderer branch, and sizing/positioning config is **scattered**: `mode`
(canvas/grid/layout), `gap`, `grid_rows`, `anchor`, `pct_x/pct_y`, `width/height` (px or
%). Hard to reason about, hard to extend.

The fix: one **element** shape with a **universal `style`** (the box model), where
**layout** is decided by `style.display` on containers — exactly like HTML/CSS.

## The model

```json
{
  "tag": "div",          // element kind (see Tags)
  "id": "shop",          // optional, addressable for ui_set
  "style": { ... },      // universal box-model + layout (see Style)
  "children": [ ... ],   // containers only
  "callback": "buy",     // optional → clickable, emits ui_callback
  ...content props       // leaf-specific (text, prefab, value, …)
}
```

### Tags — two families (like HTML)

**Containers** (arrange children; honour `style.display`):
- `div` — the base. `display` decides how children lay out.

**Leaves** (render content; ignore `display`, still honour the box model):
- `text` — a string (`text`, `size`, `color`)
- `button` — clickable label (`text`, `callback`)
- `icon` — item sprite (`prefab` | `atlas`+`tex`)
- `image` — arbitrary texture (`atlas`, `tex`, `tint`)
- `bar` — progress (`value`, `max`)
- `input` — editable field (`placeholder`, `callback`) — was `text_input`
- `tabs` — tab bar + pages (`tabs: [{label, child}]`)

> Distinction matters: a `text` has width/margin (box model) but its content doesn't
> "flex". Only `div` containers lay out children. Same as `<span>` vs `<div>` in HTML.

### Style — the universal box model

Every element accepts `style`. All sizes are **px number** OR **"N%"** (resolved
against `width_ref`/`height_ref`: `screen` | `panel` | `parent`, default `parent`).

```
style: {
  // box
  width, height,                 // px | "%"
  width_ref, height_ref,         // % reference
  padding, margin,               // px (or {top,right,bottom,left})
  // layout (div only)
  display: "flex" | "grid" | "block" | "absolute",
  direction: "row" | "column",   // flex main axis (default column)
  gap,                           // px between children
  justify: "start"|"center"|"end"|"between",  // main-axis
  align:   "start"|"center"|"end"|"stretch",  // cross-axis
  cols,                          // grid: N columns  (or grid_template for weights)
  // positioning (child of an absolute/relative parent)
  position: "static" | "absolute",
  x, y,                          // px | "%" — when position:absolute (or screen anchor on root)
  // visual
  background, border, radius, color, opacity, scale,
}
```

### display → legacy equivalence

| display | legacy | meaning |
|---------|--------|---------|
| `flex` + `direction:column` | `col` | vertical stack |
| `flex` + `direction:row` | `row` | horizontal stack |
| `grid` + `cols:N` | `mode:grid` | uniform grid |
| `absolute` | `mode:canvas` | children placed by x/y |
| `block` | (panel body) | single-column default |

### Root placement

The root element is placed on the 1280×720 screen by `style.x`/`style.y` as **percent
of the screen** (the pct_x/pct_y model already shipped). Center default.

## Renderer

A new `RenderElement(node, parent, ctx)` understands `tag` + `style`. The existing
`RenderNode` stays; a thin **adapter** maps legacy nodes onto the element model:

```
col   → { tag:'div', style:{ display:'flex', direction:'column', gap } }
row   → { tag:'div', style:{ display:'flex', direction:'row', gap } }
panel(mode:canvas) → { tag:'div', style:{ display:'absolute', width, height } }
grid  → { tag:'div', style:{ display:'grid', cols } }
text/button/… → same tag, props moved under content + style
```

So one renderer path; legacy trees are normalized into elements before rendering.

## Layout engine — phased (the hard part)

`style.display` needs the parent size **before** sizing percent children. Today layout
is bottom-up (auto-size). Phases:

1. **Now (shipped):** percent vs fixed reference (screen/panel) — no engine change.
2. **Next:** `display:flex`/`grid` with a **fixed-size container** → children size against
   the known container box (top-down). Covered by the element model + box model.
3. **Later:** **2-pass layout** for auto-size containers with percent children
   (measure → resolve → place). This is what makes it a true CSS engine. Big refactor;
   only do it when phase 2 isn't enough.

## Reach goal — "DOOM in-game"

With a fixed-size `div` (display:absolute) acting as a framebuffer and `image`/colored
`div` cells as pixels, a flow can drive a raster display. Not a real renderer — a proof
that the element model + percent/absolute layout is expressive enough to compose
anything. Lives on this branch as an experiment, not shipped.

## Migration rule

New work uses the element model. Legacy node types are **never removed** until every
example flow is migrated; the adapter keeps them rendering. `validateFlow` learns the
element shape alongside the legacy types.
