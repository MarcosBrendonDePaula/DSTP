# UI by Nodes — how flows compose in-game UI

The DSTP automation engine can build in-game DST UI from flows. This is NOT
HTML rendered in-game (DST has no webview); it's a declarative widget tree that
a Lua renderer draws. See `dst-client-constraints.md` for the engine limits and
`ui-system.md` for the full node/prop/action contract.

## The pipeline (3 layers)

```
Editor (nodes)  →  backend builds a tree  →  ui_command{type:'tree'}  →  RenderNode (Lua)
   authoring         resolveTree/buildUITree     net_string per player      widgets + auto-layout
```

A UI is a tree of nodes: `{ type, ...props, children:[...] }`. The Lua renderer
(`scripts/dstp/ui_widgets.lua`) lays it out with a real auto-layout (DST has no
flex — col/row measure children via `Text:GetRegionSize`/`Image:GetSize` and
stack with gap).

## Two ways to author UI (both produce the same tree)

1. **UI Builder node** (`ui_builder`) — RECOMMENDED. One node on the canvas; the
   whole tree lives in `node.data.tree`, edited in a visual tree editor inside
   the NodeDetailPanel (double-click). Keeps the canvas clean. Backend resolves
   `{{templates}}` over the tree (`resolveTree`) and pushes it.
2. **Loose ui_\* nodes** — `ui_panel` is the root; its outgoing edges mean
   "child of" (NOT next action). `buildUITree` walks the subgraph, orders
   children by canvas position (Y for col/panel, X for row), resolves templates.
   Verbose (~25 nodes for a shop); kept for compatibility.

## Generic capabilities (avoid hardcoding new features)

The renderer is meant to be generic. Before adding a new widget type, ask if a
generic prop/action covers it:

- **Any node addressable** — give it `node_id`; then `ui_set` patches any prop
  (`text`, `color`, `value`, `max`, `visible`, `tint`, `prefab`, `tex`) in place,
  no rebuild, no flicker. This is the reactivity mechanism (live balance, HP bar
  value, show/hide a section).
- **Any node clickable** — give it `callback`; the click emits a `ui_callback`
  trigger with `{{trigger.callback}}` (0.5s debounce). Icons/text/images, not
  just buttons.
- **Tabs** — `ui_tabs` with child cols, each tagged `tab_label`. Switching is
  client-side (Show/Hide), no round-trip.
- **Follow a world entity** — `ui_track` (`follow` block). Modes: `guid`,
  `prefab` (nearest matching), `nearest`, `combat_target` (the player's current
  combat target, with nearest-creature fallback). Reads `inst.dstp_hp` for real
  mob health (see constraints doc).

**Principle:** if a new UI needs new Lua, the renderer isn't generic enough —
the missing capability should become a prop/action, not a special widget type.

## Patterns proven this session

- **Shop**: `panel > [balance text, tabs[Comprar, Vender]]`. Buy debits virtual
  coins (memory) or real items; sell removes items atomically and credits only
  on confirmation. Live balance + per-item "tem: N" via `ui_set`.
- **Live player HUD**: `tick` event (synthetic heartbeat, ~1s/player, emitted by
  the backend on sync) → `get_player` (rich source: hp/hunger/sanity/pos) →
  `ui_set` each field. Don't bake fields into the tick; use get_player.
- **HP bar over mobs**: `ui_track` + the mob-health netvar (constraints doc).

## Key backend pieces

- `FlowEngine.buildUITree` — subgraph → tree (loose nodes).
- `FlowEngine.resolveTree` — resolves templates over a literal tree (ui_builder).
- `runFlowAction` — maps `ui_*` action types to `ui_command` payloads.
- `coerceParam` — editor saves strings; numeric/boolean params coerced by key.

## Cross-flow memory

The `memory` node's `flow` param overrides the namespace, so one flow can read
another's keys (e.g. the shop-open flow reads the balance written by shop-buy:
`coins:<userid>` in the `shop-buy` namespace).
