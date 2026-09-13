# Container slots — bigger chests, Chester and backpacks

Slot count and the on-screen position of every slot come from Klei's
`containers.params[prefab].widget.slotpos`, read by the SERVER (sizes the container in
`Container:WidgetSetup` -> `SetNumSlots`) and by every CLIENT (the replica draws the window
from the same table). Module: `scripts/dstp/container_slots.lua` (pure data, tested under
fengari in `container-slots.test.ts`).

## Two layers

| Layer | Who decides | How |
|---|---|---|
| **World default** | modinfo (`CHEST_SLOTS`, `CHESTER_SLOTS`, `BACKPACK_SLOTS`, `ICEBOX_SLOTS`) | `Apply` grows `containers.params` at load, on both sides, centred 80 px grid. Only grows; aliases sharing the table (pandoraschest = treasurechest) grow together. |
| **Per instance, at runtime** | the flow: `entity_set_slots { id / guid / prefab+x,z, slots, token }` | `SetInstance` -> `Container:WidgetSetup(prefab, data)` with a COPY of the params; a `net_byte "dstp.slots"` (declared on both sides for every prefab in `containers.params`) ships the count; the client re-runs the replica `WidgetSetup` on dirty. Ack: `entity_slots { ok, reason, slots, guid, prefab }`. |

Persistence: `components/dstp_slots.lua` saves the count; an `OnPreLoad` hook re-applies it
BEFORE `Container:OnLoad` puts items back by slot index (else items in grown slots would
be lost). Verified in-game: items in slot 10+ survive a save/load.

## The pool cap — why 37 crashes and 36 does not

Each container's `container_classified` allocates a FIXED pool of `net_entity` item
netvars when the entity is created: `containers.MAXITEMSLOTS` of them (the largest
widget in `containers.params` at load, 15 in vanilla). `InitializeSlots` takes netvars
from that pool; past it, `table.insert(t, nil)` raises
`wrong number of arguments to 'insert'`, the exact error seen when a pet was grown to 25
in a world whose pool was 16.

Fix: `ReservePool(containers)` in `modmain.lua` raises `containers.MAXITEMSLOTS` to
`MAX_SLOTS` (36) at load, on BOTH sides (netvars are positional, so server and client
must allocate the same pool). `ApplyToInstance` refuses `n > MAX_SLOTS` with `too_big`,
and the command is pcall'd so a failure reaches the flow as `entity_slots { ok: false,
reason }` instead of a silent log line. Changing `MAX_SLOTS` needs a world restart.

## Reasons in the ack

`not_bigger` (Klei asserts only-grow), `too_big`, `no_container`, `no_params` (prefab not in
`containers.params`), `not_found` (resolver), `error: ...` (anything the engine raised).

## Flow patterns

- `structure_built` prefab == treasurechest -> `entity_set_slots { prefab, x, z, slots: 25 }`
  (examples `Baus_Grandes`).
- A per-player size: `!petslots N` -> `memory petslots:<userid>` -> applied by id to the
  current pet and to every future one (examples `Pet_Chester`).

The frame art is left as-is (cosmetic mismatch for big grids). Player inventory (15 + HUD
bar) is not covered.
