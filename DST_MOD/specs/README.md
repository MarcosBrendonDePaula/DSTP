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

Top-level docs (`/AUTOMATION.md`, `/WORKERS.md`, `/CLAUDE.md`) cover the
automation engine, the per-server worker architecture, and project-wide rules.

## The one principle to remember

DST does not give the game client what you'd expect (mob health isn't
replicated; combat hits fire server-only; widget coords are a virtual space).
When something "should work" but doesn't, suspect a client/server replication
gap first — and check `dst-client-constraints.md` before re-discovering it.
