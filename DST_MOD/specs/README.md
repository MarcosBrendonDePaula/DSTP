# DSTP Specs

Hard-won technical knowledge that isn't obvious from the code. Read the
relevant spec before working on these areas — they document constraints and
techniques that cost real debugging time to discover.

| Spec | Read it when… |
|------|---------------|
| [dst-client-constraints.md](dst-client-constraints.md) | Touching anything across the DST client/server boundary, HUD rendering, mob health, net_string, or coordinate space. The "why it didn't work" doc. |
| [ui-by-nodes.md](ui-by-nodes.md) | Building in-game UI from flows — UI Builder, the generic renderer, tabs, follow-entity, shops, HUDs. |
| [ui-system.md](ui-system.md) | The full UI tree contract: node types, props, actions, events. Reference for the renderer. |
| [dynamic-data-bindings.md](dynamic-data-bindings.md) | The binding system: a generic way to replicate server-only data (mob health, etc.) to the client via curated sources. Read before adding/changing data capture. |
| [data-catalog.md](data-catalog.md) | What data is worth replicating to the client and what isn't — implemented sources + candidates (player HP, mob combat state, structure timers, fuel) with the "only with a UI that uses it" rule. |
| [mod-audit-2026-06.md](mod-audit-2026-06.md) | Auditing the mod's structure/bugs — the god-module problem, dead/leaked listeners, the modularization plan. |

### Entity events & control (non-player mobs / structures / world objects)

| Spec | Read it when… |
|------|---------------|
| [entity-events-catalog.md](entity-events-catalog.md) | Adding a trigger that fires on a non-player entity (mob/structure/world object). The ranked survey of 26 candidates + the hook mechanism for each. The IMPLEMENTED set (14 + the `creatures` category) is the low/medium-effort tier. |
| [entity-control-catalog.md](entity-control-catalog.md) | Adding an ACTION that READS or CONTROLS an entity by GUID (get_entity, set_target/leader/sleep, fire/freeze/fuel, container ops, the spawn→control→react "NPC by flow" core). 88 ops with source + verified danger/keying corrections in §9. |
| [research/](research/) | The raw multi-agent sweeps behind the catalogs (entity-events, type-bug, dead-listener, HUD-click, drag, text-input studies). Conclusions live in the sibling specs; this is the evidence. |

### Feasibility studies (what the engine does / doesn't allow)

| Spec | Read it when… |
|------|---------------|
| [dynamic-content-feasibility.md](dynamic-content-feasibility.md) | Considering adding NEW content (item/mob/machine/recipe) at runtime. The honest walls: new asset-backed prefabs/recipes = NEEDS-CLIENT-MOD; recombining loaded prefabs (reskin/retune) = FEASIBLE-LIVE; all of it LOST-ON-RELOAD without re-application. |
| [http-prefab-transport.md](http-prefab-transport.md) | Considering shipping a prefab/asset to a connected client over HTTP bytes. The sharp split: Lua source + JSON data over HTTP WORKS; genuinely new binary assets (anim/tex/sound) are WALLED — Workshop-download-only. |

Top-level docs (`/AUTOMATION.md`, `/WORKERS.md`, `/CLAUDE.md`) cover the
automation engine, the per-server worker architecture, and project-wide rules.

## The one principle to remember

DST does not give the game client what you'd expect (mob health isn't
replicated; combat hits fire server-only; widget coords are a virtual space).
When something "should work" but doesn't, suspect a client/server replication
gap first — and check `dst-client-constraints.md` before re-discovering it.
