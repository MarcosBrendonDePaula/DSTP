# Data Catalog — what to replicate to the client (and what not to)

This catalogs candidate data sources for the binding system
(`dynamic-data-bindings.md`). It is a **planning doc**, not a backlog — most of
these are NOT implemented and should only be added when a concrete UI needs them.

## The rule: traffic standard data only, with a use

Adding a binding puts a netvar on entities and traffic on the wire. So a source
earns its place only when BOTH hold:

1. **The client doesn't already have it.** Player's own vitals (health, hunger,
   sanity, temperature, moisture) and position already reach the client/backend
   natively — no binding needed. Bindings are for data about *other* entities
   (mobs, other players, structures) or server-only fields.
2. **A real UI/HUD/local-logic uses it.** No "just in case" sources — they cost
   network for data nobody looks at.

> Decision (this session): do NOT add more sources yet. Implement one only when
> a concrete UI is being built that consumes it.

## Implemented

| Source | `as` | Gate | Use |
|--------|------|------|-----|
| `health` | `dstp_hp` / `dstp_hp_max` | curated prefab list | HP bar over mobs (follow widget) |

## Candidates (not implemented)

### High value
- **Other players' health** — HP of each player visible on the client (a party
  scoreboard / team HUD; the game replicates a player's vitals to that player,
  not to others). Gate: player prefabs.
- **Mob combat state** — is a mob aggro / does it have a target? Threat
  indicator, "boss woke up" alert, anti-grief. Server reads
  `components.combat`/`combat:GetTarget()`; hook the target-setting path.

### Medium value (structure timers)
- **Cooking / maturation progress** — crockpot cooking %, farm plant growth,
  drying rack %. A progress bar/timer over the structure. Sources:
  `stewer`/`cooker`, `crop`/`pickable`, `dryer`.
- **Fuel remaining** — campfire/lantern fuel level → a bar over the fire warning
  it's about to die. Source: `fueled` (`currentfuel`/`maxfuel`, has `DoDelta`).
- **Perishable freshness** — food rotting on the ground. Source: `perishable`
  (`GetPercent`). Indicator over the item.

### Low value / skip
- Player's own hunger/sanity/temperature/moisture — already client-side.
- Position — already in the HTTP sync.
- Anything that changes every frame and isn't shown.

## How to add a source (when a UI needs it)

In `modmain.lua`, add to `BIND_SOURCES` and `BINDINGS` — no other code changes:

```lua
-- 1) a reader in BIND_SOURCES (gate MUST be by prefab — see constraints doc)
fuel = {
  gate = function(inst) return FUELED_PREFABS[inst.prefab] == true end,
  read = function(inst) local f = inst.components and inst.components.fueled
                        if not f then return nil end
                        return f.currentfuel, f.maxfuel end,
  hook = { comp = "fueled", method = "DoDelta" },
}
-- 2) a binding in BINDINGS
{ id = "fuel", source = "fuel", as = "dstp_fuel", net = "ushortint" }
```

Then the client reads `inst.dstp_fuel` / `inst.dstp_fuel_max`, and a `ui_track`
follow widget (or any UI) can show it. Mind the netvar gate rules in
`dst-client-constraints.md` — gate by prefab, always.
