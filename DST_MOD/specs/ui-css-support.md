# DSTP UI — CSS Support Matrix (what the DST engine can render)

Status: **design spec.** Defines which CSS-like `style` properties the DSTP UI engine
supports, which can be FAKED with DST primitives, and which are IMPOSSIBLE (the Klei
widget engine has no equivalent). The element model (`ui-element-model.md`) carries
these under `style`; the renderer (`ui_widgets.lua`) implements the supported set.

**This is NOT a browser.** DST UI is built from a tiny widget set: `Image` (tintable
texture, SetTint/SetSize/SetScale), `Text` (SetColour/size/align), `ImageButton`,
`TextEdit`, `Widget` (container). Everything below is bounded by those.

## Legend
- ✅ **native** — a direct widget capability
- 🟡 **fake** — composable from primitives (e.g. a tinted Image behind a container)
- ❌ **impossible** — no engine primitive; won't implement

## Layout (DONE — phases 1–2)

| CSS | Status | Notes |
|-----|--------|-------|
| `display: flex` | ✅ | col/row via LayoutChildren |
| `display: grid` | ✅ | grid/grid_template (weights) |
| `display: block` | ✅ | single column |
| `position: absolute` + `x/y` | ✅ | canvas mode |
| `flex-direction` | ✅ | row/column |
| `gap` | ✅ | between children |
| `justify-content` | ✅ | start/center/end/between |
| `align-items` | ✅ | start/center/end (stretch ≈ center for now) |
| `width`/`height` | ✅ | px or `%` (ref: screen/panel/parent) |
| `padding` | ✅ | shrinks content box |
| `margin` | 🟡 TODO | per-child outer space — add as a wrapper offset in LayoutChildren |

## Visual box (NEXT — to implement)

| CSS | Status | How |
|-----|--------|-----|
| `color` | ✅ | Text:SetColour (already on text/button/label) |
| `background` / `background-color` | 🟡 | a tinted `Image(square.tex)` sized to the container box, inserted BEHIND children |
| `opacity` | 🟡 | multiply the widget colour/tint alpha; for a container, alpha on its bg image + SetScale doesn't carry alpha to children → apply per-leaf or via bg only |
| `border` (solid) | 🟡 | a slightly larger tinted Image behind the bg (frame), or 4 thin Images; width+color only |
| `border-radius` | 🟡 | ONLY with a pre-made rounded texture (e.g. panel.tex); arbitrary radius ❌ |
| `box-shadow` | 🟡 | a blurred/offset dark Image behind — crude; usually skip |
| `transform: scale` | ✅ | SetScale (already: node.scale) |
| `transform: rotate/translate/3d` | ❌ | no widget rotate; translate = position only |
| `gradient` | ❌ | no gradient fill; could fake with a gradient texture asset only |
| `transition` / `animation` | ❌ | no tween in the declarative tree (the mod CAN MoveTo/scale in code, but not as a style prop) |
| `font-family` (web fonts) | 🟡 | only DST's built-in fonts (BODYTEXTFONT, TITLEFONT, …) via a `font` enum |
| `font-size` | ✅ | Text size |
| `text-align` | ✅ | SetHAlign/SetVAlign |
| `overflow` / scroll | ❌ | no clip/scroll container in this set |
| `z-index` | 🟡 | child order + MoveToFront; no arbitrary stacking context |
| `cursor`, `hover`, `:focus` (CSS) | 🟡 | hover/focus exist as ENGINE behavior (clickable/focus), not as style selectors |

## The supported `style` set (target)

```
style: {
  // layout (done)
  display, direction, gap, justify, align, cols, grid_template, position, x, y,
  width, height, width_ref, height_ref, padding,
  // visual (next)
  margin,            // px | {t,r,b,l}
  background,        // color [r,g,b,a] or hex → tinted square.tex behind
  border,            // { width, color }  → frame Image
  radius,            // only maps to a rounded texture preset; arbitrary = ignored
  opacity,           // 0..1
  color,             // text/leaf colour
  font, size,        // text
  align_text,        // text h/v align
  scale,             // SetScale
}
```

Anything not in this list is **dropped** (logged once in DEBUG), never errors.

## Implementation plan (visual box)

1. **background** — in RenderNodeImpl for `div`/panel, before rendering children, add a
   tinted `Image("images/global.xml","square.tex")` sized to the (resolved) box,
   `MoveToBack`. Color from `style.background`.
2. **border** — same, a frame Image one `border.width` larger, behind the bg.
3. **opacity** — fold into the bg/leaf colour alpha.
4. **margin** — in LayoutChildren, add the child's margin to its measured extent and
   offset its position.
5. **radius/shadow/gradient** — map `radius` to a rounded preset texture if one exists;
   otherwise no-op. Document as engine-limited.

## Rule

We implement the **CSS-shaped subset the DST engine can actually draw**, with CSS names
so authors (and the AI generator) reason in CSS terms. We do NOT promise full CSS — the
matrix above is the contract. Impossible props are documented, not faked badly.
