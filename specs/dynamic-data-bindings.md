# Dynamic Data Bindings — proposal (DRAFT, not implemented)

## The problem

Every time a flow needs a piece of client/server data that DST doesn't expose
the way we want (mob health, an entity's temperature, the player's combat
target, distance to something…), we have to **edit the Lua mod by hand** and the
user has to **reload the mod**. That's slow, risky (the mob-health netvar broke
the whole game's net stream — see `dst-client-constraints.md`), and doesn't
scale: the mod becomes a pile of one-off hardcoded captures.

We already solved the same shape twice — UI went from hardcoded Lua widgets to a
declarative tree (`ui-by-nodes.md`), and client reactions went to the
`rules_engine` (data, not code). This proposes the same jump for **data
capture/replication**: the backend declares *what data it wants*, and a generic
interpreter in the mod provides it — no new Lua, no recompile.

## The core idea: a "binding" is data, not code

A binding declares: a **source** of data, an optional **gate** (which entities),
and a **name** to expose it under. The mod ships a small interpreter that, given
a list of bindings, wires up the capture + replication + exposure generically.

```jsonc
{
  "id": "mob_hp",
  "scope": "entity",            // entity | player | world
  "gate":  "tag:monster|animal|epic",   // which entities (TAG-based, see safety)
  "source": "health.percent",  // a whitelisted readable path
  "as": "dstp_hp",              // client reads inst.dstp_hp
  "net": "ushortint",           // how to replicate
  "on": "health.delta"          // server re-push trigger (event/component hook)
}
```

The backend pushes a `bindings` set (like it pushes `rules`); the mod's binding
interpreter sets them up. Adding "show mob temperature" becomes one binding, not
a Lua edit.

## Why this is dangerous and how the design stays safe

The netvar crash taught the hard rule: **netvars are positional — server and
client must declare the same ones, in the same order, on the same entities, or
the entity's whole net stream corrupts.** So the interpreter is NOT free-form:

1. **Gate by TAGS only.** Tags replicate, so `inst:HasTag(...)` returns the same
   result on both sides → the same bindings are created on both sides. Never
   gate by `components.*` (server-only) or by anything async.
2. **Deterministic order.** Bindings are applied in a fixed, sorted order (by
   `id`) so the netvar declaration order is identical everywhere.
3. **Declared synchronously** in the PostInit, both sides, before any value is
   set. Only the server's value-push may be deferred.
4. **Whitelisted sources.** `source` is a key into a fixed table of safe readers
   (`health.percent`, `health.current`, `position`, `temperature`, …), not
   arbitrary Lua. No `loadstring`. This keeps it data, not code.
5. **Bindings are fixed at mod load (or a controlled reload), NOT per-frame.**
   You can't hot-add a netvar to live entities safely — changing the binding set
   must re-run the PostInit deterministically (new entities pick it up; a full
   set change ideally needs a shard reset, like the Health Info mod warns).

> Consequence: the binding SET is semi-static (changes are a deliberate, ordered
> reconfig), even though *which data flows* through it is dynamic. This is the
> price of DST's positional netvars — accept it rather than fight it.

## Three scopes

- **player** — data about a player. Easiest: `player_classified` already
  replicates; expose via the existing per-player channel or player netvars.
- **entity** — data about world entities (mobs). Needs our own tag-gated netvar
  (the mob-health pattern). Highest risk → strictest rules above.
- **world** — global state (day, season, weather…). Already comes via the sync
  payload; a binding here is really just "include this field", no netvar.

## Reusing what exists

- The mob-health netvar (`modmain.lua`) is the **first concrete binding** — it's
  exactly `{scope:entity, gate:tag:creature, source:health, as:dstp_hp}` written
  by hand. The generic interpreter generalizes that one proven case.
- Exposure to flows/UI is already solved: `ui_set`/`ui_track` read `inst.<as>`;
  `get_player` reads player data; templates read world fields.
- Delivery of the binding set mirrors `rules_install` (backend → mod via the
  existing command channel).

## Suggested build order (when we implement)

1. Define the **whitelisted source table** in Lua (the only readers allowed).
2. Build the **interpreter**: takes a sorted binding list, runs the tag-gated
   PostInit, declares netvars deterministically, hooks the server push.
3. Port the **mob-health** capture to a binding (prove parity with the hardcoded
   one, no crash).
4. Backend: a way to declare bindings (config or node) and ship them.
5. Add a 2nd source (e.g. temperature) with ZERO Lua changes — the success test.

## Open questions for review

- Do we ever need to change the binding set at runtime, or is "set at mod build /
  controlled reload" acceptable? (Safer = the latter.)
- Should bindings live in mod config (baked, ultra-safe) or be pushed from the
  backend (flexible, but a bad set could still desync)? Likely: a **fixed core
  set** baked + a **small curated extra set** pushable, never arbitrary.
- For `player`/`world` scope (no entity netvar risk) we could be much more
  dynamic than for `entity`. Maybe split: entity bindings are baked/curated;
  player & world bindings are freely declarable.
```
