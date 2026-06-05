# Dynamic Content Feasibility — can DSTP add NEW content at runtime?

> **Provenance:** multi-agent workflow `dynamic-content-feasibility` (4 adversarial probes of
> vanilla `/tmp/dstscripts/scripts` + synthesis + critic). The critic VERIFIED the 5 load-bearing
> walls against source and added corrections — see the **Critique & corrections** section at the end
> (it sharpens the workable citation and adds the "doer must hold a matching tool" precondition).

> Scope: DSTP runs **server-side on the master sim** and can run arbitrary Lua
> (`execute` = `loadstring`+`setfenv(fn,_G)`) and call any component method
> (`call_component`). It talks to clients only via `net_string` on
> `player_classified` and RPCs. It **cannot ship asset files or prefab code to an
> already-connected client.** This doc says exactly where that constraint walls
> off "new content" and where recombination of already-loaded prefabs slips
> through. All line numbers are in the vanilla DST scripts (`/tmp/dstscripts/scripts`,
> git-ignored reference) unless prefixed `DST_MOD/`.

---

## 1. TL;DR verdict

**DSTP cannot add genuinely-new, asset-backed content (a new prefab, mob, machine,
recipe with its own art/icon) to a live server for connected clients — that is
hard-walled and needs a server restart + a client mod download.** But it CAN field
convincing **"new"** items/mobs/interactive props live by **recombining
already-loaded prefabs**: spawn an existing prefab and mutate the things the engine
replicates on its own (anim bank/build, colour, scale, tags, tag-based work actions)
plus all the server-only simulation (brain, stategraph, combat, loot, health
tuning). The single biggest wall is **the client constructs every networked entity
by name from its OWN `Prefabs[]` table and re-runs the prefab's OWN `fn` locally** —
`SpawnPrefabFromSim(name)` looks up `Prefabs[name]`, and a client missing it prints
`Can't find prefab` and returns `-1`, rendering nothing (mainfunctions.lua:347-358).
There is no engine path — no RPC, no `net_string` — that delivers a prefab
definition or a `.tex`/`.zip`/`.fsb` asset to a connected client. Reinforcing that:
**netvars must be declared identically on server and clients or "entity
deserialization will fail … server and clients must all have the same MOD active"**
(netvars.lua:29-32). New content = new prefab name + new netvars + new assets, and
all three are frozen on the client for the session.

---

## 2. The hard walls — cannot do live (BOOT-ONLY / NEEDS-CLIENT-MOD)

These are honest "no" answers: a restart and/or a client-side mod download is
required. Server-side capability exists for some of them, but it never reaches
connected clients.

### 2.1 A new asset-backed prefab (item / mob / machine with its own art) — NEEDS-CLIENT-MOD
The client instantiates each networked entity **by name** via the C++→Lua callback
`SpawnPrefabFromSim(name)`, which looks up the **client's own** `Prefabs[name]`. If
absent: `print("Can't find prefab "..name)` then `return -1` — the entity never
constructs client-side (mainfunctions.lua:347-358). The client's `Prefabs` table is
built at ITS boot from base scripts + ITS installed mods only (`ModManager:RegisterPrefabs`
runs in `LoadAssets` before `PopulateWorld`, gamelogic.lua). No RPC/`net_string` ships
a prefab definition. **Both ends must have run the same registration at boot**, i.e.
the same mod installed — and an asset-backed mod sets `all_clients_require_mod`, which
forces a client download/restart. Not "no client mod download."
*Source: mainfunctions.lua:347-358; netvars.lua:29-32; modindex.lua / mods.lua boot path.*

### 2.2 New asset files (`.tex` atlas / `.zip` anim / `.fsb`/`.fev` sound) at runtime — NEEDS-CLIENT-MOD
There is **no runtime asset-creation API** in the Lua surface. Asset registration
resolves paths to files that must already exist on disk: `RegisterPrefabsResolveAssets`
→ `resolvefilepath` → `kleifileexists` **asserts** the file exists
(mainfunctions.lua:119-125, util.lua:609-642). `RegisterInventoryItemAtlas` /
`LoadFont` / `LoadKlumpFile` all *bind existing* disk files; PNG→TEX is the
build-time autocompiler, not in the sim. A client only ever has the assets it loaded
at its own boot, and nothing can push a new blob to it. *Source: mainfunctions.lua:119-125;
util.lua:609-642; modutil.lua RegisterInventoryItemAtlas.*

### 2.3 A new craftable recipe that appears in connected players' menus — BOOT-ONLY
The `Recipe`/`Recipe2` ctor (`AllRecipes[name]=self`, recipe.lua:178) is technically
callable late, but the crafting menu is built **client-side** from the client's own
`AllRecipes`/`CRAFTING_FILTERS` (static, boot-built), and the build RPC
(`MakeRecipeFromMenu`) carries `rpc_id = smallhash(name)` (recipe.lua:200) resolved
against the **server's** `AllRecipes` (networkclientrpc.lua:937-952). A server-only
recipe is in neither client menu nor a valid client RPC.
**Decisive hard wall:** per-recipe `net_bool` netvars are allocated in
`for k, v in pairs(AllRecipes) do` **at `player_classified` construction**
(prefabs/player_classified.lua:1527). Per netvars.lua:29-32 they must match
server+client identically. **Calling `Recipe()`/`AddRecipe2()` on a live server is
actively dangerous** — it changes the `AllRecipes` the next-joining client's
`player_classified` netvar set is built from vs. the server's → netvar-count mismatch
→ deserialization failure of the player's OWN state entity (crash/desync). Do not do
it live. *Source: recipe.lua:178,200; prefabs/player_classified.lua:1527;
networkclientrpc.lua:937-952; netvars.lua:29-32.*

### 2.4 A new placeable machine/structure (with placer) — NEEDS-CLIENT-MOD
A structure is prefab + recipe + placer prefab. All of §2.1 and §2.3 apply: the
client drives placement from its own placer prefab and its own recipe menu, and must
replicate the built structure by a prefab name it has. None of those are deliverable
live. *Source: networkclientrpc.lua (MakeRecipeAtPoint placer path resolves rpc_id
against AllRecipes); recipe.lua (placer field); mainfunctions.lua:347-358.*

### 2.5 A new crockpot/cooker recipe yielding a new dish — BOOT-ONLY
`AddCookerRecipe` writes `cookerrecipes[cooker][name]` (cooking.lua) and resolution
runs server-side, so the **server** could produce a dish — but if the product is a
new prefab the client lacks, §2.1 walls it; and the client cookbook UI reads its own
boot-time tables. Mixed/partial at best, never a clean live add. *Source: cooking.lua
AddCookerRecipe/CalculateRecipe; modutil.lua AddCookerRecipe.*

### 2.6 A new mod character — BOOT-ONLY
`AddModCharacter` runs from modmain at boot; character prefabs load via
`TheSim:LoadPrefabs(chars)` during gamelogic startup, with selection/skins wired at
boot. Same root cause as all prefab content. *Source: modutil.lua AddModCharacter;
gamelogic.lua LoadPrefabs(chars/newchars).*

### 2.7 A new ACTION verb usable by clients — NEEDS-CLIENT-MOD
`AddAction`/`AddComponentAction` populate `ACTIONS`/`COMPONENT_ACTIONS`, indexed by
id at boot on BOTH sides (`RemapComponentActions` runs once). The per-entity
`actioncomponents` net_bytearray transmits component **IDs**, which the client maps
back via its OWN boot-time table. A new action id only on the server is meaningless
client-side. You must express new interactivity through **existing** verbs (CHOP,
ACTIVATE, RUMMAGE, USEITEMON, …). *Source: componentactions.lua RemapComponentActions /
AddComponentAction; entityscript.lua:180-205 (client maps ids via its own tables).*

### 2.8 New worldgen / topology / setpiece / biome — BOOT-ONLY
Worldgen runs only at world CREATE (a separate sim), with no runtime topology-inject
API. You can retune existing spawners and `SpawnPrefab` existing entities anywhere,
but cannot add a generated region/setpiece to a running world. *Source: gamelogic.lua
PopulateWorld; spawner.lua.*

### Server-side-only trap (looks possible, breaks for clients) — SERVER-ONLY-DESYNC
`RegisterSinglePrefab`/`RegisterPrefabsImpl` are plain runtime-callable functions
(mainfunctions.lua:103-141), and `ModReloadFrontEndAssets`/`ModPreloadAssets` prove
`RegisterSinglePrefab`+`TheSim:LoadPrefabs` is callable AFTER the initial registration
sweep (mainfunctions.lua:198-247). So you CAN register+spawn a new prefab on the
**server**. But every connected client hits the `SpawnPrefabFromSim` miss (§2.1):
invisible entity / `Can't find prefab` log spew, and a net-stream failure if it
declares netvars. Useful only on a headless server with no rendering clients.
**Do not mistake "callable live" for "usable by clients."**

---

## 3. The pragmatic runtime surface — FEASIBLE-LIVE (the recombination playbook)

The genuinely-live moddable surface is **spawn an EXISTING (boot-registered) prefab,
then mutate what the engine replicates on its own** — no new prefab name, no new
netvars, no new assets. Everything below replicates because every client already
loaded that prefab + its assets at boot. This is what DSTP could expose as flow
actions. Ranked by value.

### What replicates for free (engine-level, no per-prefab netvar)
- **Tags** — `inst:AddTag/RemoveTag` (entityscript.lua:556) are part of replicated
  network state.
- **AnimState** — `SetBank/SetBuild/PlayAnimation/OverrideSymbol/AddOverrideBuild/
  SetMultColour/SetScale` (AnimState is a C++ object the engine auto-replicates).
  **Constraint:** the bank/build/symbol must be an **already-loaded** asset;
  `SetBuild('totally_new_build')` no-ops/errors on clients lacking it.
- **Transform** — `SetScale`.
- **The per-entity `actioncomponents` net_bytearray** — exists on EVERY entity from
  construction (entityscript.lua:181) and is updated live when you
  `RegisterComponentActions` late.
- **Position / prefab / animation** — replicated natively
  (`DST_MOD/specs/dst-client-constraints.md:24`).

### What is server-only but fine (drives behaviour; only its *effects* replicate)
- `SetBrain` (entityscript.lua:1103), `SetStateGraph` (entityscript.lua:1148 — asserts
  the sgraph already exists), and **non-replicatable** `AddComponent` (lootdropper,
  combat/health tuning, perishable, fueled, burnable, edible, finiteuses, inspectable,
  talker server text). These declare no netvars → no desync. The client just renders
  the resulting movement/anim/combat outcome.

### Ranked flow actions DSTP could expose

1. **"Create custom mob"** (FEASIBLE-LIVE) — `SpawnPrefab('spider')` (or any mob),
   then `health:SetMaxHealth`, `combat:SetDefaultDamage`,
   `locomotor:SetExternalSpeedMultiplier`, `AnimState:SetBuild`/`SetMultColour`
   (recolor), `Transform:SetScale` (resize), `AddTag`, swap `SetBrain`/`SetStateGraph`
   and loot — all server-side. Scale/colour/anim/tags replicate; brain/combat run on
   master sim. Yields a convincingly distinct mob with zero client mod.
   *Bound:* reskin of an existing prefab's banks/builds/physics; **mob HP is never
   replicated to clients** (only players have a health replica — components/
   health_replica.lua hangs on `player_classified`), so an HP bar must go through
   DSTP's own netvar binding, not the health replica (`DST_MOD/specs/dynamic-data-bindings.md`).
   *Source: entityscript.lua:1103,1148,556; health_replica.lua.*

2. **"Make a thing CHOP/MINE/HAMMER-able"** (FEASIBLE-LIVE) — the cleanest "new
   interactive prop." `AddComponent('workable')` on the server sets the
   `<ACTION>_workable` tags; `RegisterComponentActions` pushes the id into the
   per-entity `actioncomponents` net_bytearray (live, exists since construction). The
   workable action collector keys **purely off tags**
   (`inst:HasTag(action.id.."_workable")`, componentactions.lua:3034) — **no replica
   deref**, so connected clients see and perform the work action immediately, no
   crash. Set `workleft`/`onfinish` server-side. This is the reference pattern for
   live interactivity. *Source: componentactions.lua:3034; entityscript.lua:181.*

3. **"Reskin / rename item"** (FEASIBLE-LIVE, with one caveat) — `SpawnPrefab`
   existing item; `AnimState:SetMultColour`/`SetScale` (replicate). Custom networked
   display name via the **`named` replica** `Named:SetName` (net_string, replicates) —
   **but only if the base prefab already shipped the `named` replica** (most
   inspectable items do; named is in REPLICATABLE_COMPONENTS so late-adding it hits
   the wall in §3-trap). The **inventory icon will NOT change** — it's a client asset
   keyed off prefab name, unswappable live. *Source: components/named_replica.lua
   (net_string at construction); entityreplica.lua:5-25.*

4. **"Reskin / repurpose a structure"** (FEASIBLE-LIVE) — take an EXISTING structure
   prefab clients have and change anim/colour/tags + server-only component behaviour.
   A *structurally novel* building does not work (§2.4), but a reskinned existing one
   replicates fine.

5. **"Pseudo-spawner / live difficulty"** (FEASIBLE-LIVE) — a flow timer that
   `SpawnPrefab`s existing prefabs at chosen coords is a fully-in-wheelhouse substitute
   for a real spawner. Plus genuine runtime world knobs:
   - **Season length / current season / clock segs** — `ms_setseasonlength` /
     `ms_setseason` / `ms_advanceseason` (seasons.lua). Lengths are `net_byte`
     netvars (seasons.lua:72) so they **replicate**. Push on the **master** shard.
   - **Spawn rates / boss & regrowth timers** — `WorldSettingsTimer:SetMaxTime/
     StartTimer/PauseTimer` (worldsettingstimer.lua), `WorldSettings:SetSetting` via
     `ms_setworldsetting`, `Spawner:Configure/SpawnWithDelay` (spawner.lua). Pure
     server-side; effects replicate as normal spawns.
   *Source: seasons.lua:72,466-471; worldsettingstimer.lua; worldsettings.lua; spawner.lua.*

6. **TUNING mutation** (FEASIBLE-LIVE, with a gotcha) — `TUNING` is a mutable global
   (tuning.lua:3). **Per-use reads pick it up immediately** (e.g. combat reads
   `TUNING.ELECTRIC_DAMAGE_MULT` per attack). **Construction-cached reads do NOT**
   (e.g. `health:SetMaxHealth(TUNING.SPIDER_HEALTH)` is read once at spawn). To affect
   already-spawned entities you must ALSO call the per-entity setter via `call_component`.
   Treat bare TUNING edits as "future per-use reads only." *Source: tuning.lua:3;
   combat.lua; spider.lua SetMaxHealth at spawn.*

### The crash trap inside the recombination surface — SERVER-ONLY-DESYNC
**Adding a REPLICATABLE component to an already-replicated live entity** is the one
recombination move that crashes clients. `AddComponent` → `ReplicateComponent` adds
the `_<name>` tag and would build the replica, but the client builds replicas **only
once**, in `ReplicateEntity`, called by the engine immediately after construction —
**there is no re-trigger when the `_<name>` tag arrives late**. So on clients the
replica is never created → `inst.replica.<name>` stays `nil`. Action collectors that
deref it (container's `inst.replica.container:CanBeOpened()`, machine's
`inst.replica.inventoryitem`, componentactions.lua:~299,531) then yield nothing or
**nil-crash the client**. Each replica also declares construction-time netvars (e.g.
`combat_replica` net_entity/net_bool/net_float keyed by GUID) → off-baseline desync.
The REPLICATABLE set (entityreplica.lua:5-25): **builder, combat, container,
constructionsite, equippable, fishingrod, follower, health, hunger, inventory,
inventoryitem, moisture, named, oceanfishingrod, rider, sanity, sheltered, stackable,
writeable.** **Never add any of these to a live, already-spawned entity.** This is
exactly DSTP's documented "tags/replicas/components desync → crash" rule
(`DST_MOD/specs/dynamic-data-bindings.md`, `dst-client-constraints.md:56-78`).
**Corollary:** "make a chest into a working container/machine" is SERVER-ONLY-DESYNC —
use a **tag-based action** (workable / an existing verb + tag-only collector) for live
interactivity, not `container`/`machine`. *Source: entityscript.lua:610-647;
entityreplica.lua:5-25,33-86; components/combat_replica.lua; componentactions.lua:~299,531.*

---

## 4. The LOST-ON-RELOAD trap

Every runtime mutation above is **erased on world reload** — orthogonal to the
networking walls. `GetSaveRecord` persists only `{prefab, position, skin, per-component
OnSave data}` (entityscript.lua:248); `SpawnSaveRecord` **re-runs the BASE prefab `fn`**
then feeds component data back (mainfunctions.lua:438-484). Any tag, colour, scale,
brain swap, or added component that isn't in the base prefab `fn` and isn't captured
by an existing component's `OnSave` is **gone after reload**. The lone engine-sanctioned
"add a component from save data" carve-out is `scenariorunner` — and it needs a
boot-time `scenarios/<name>.lua` (mainfunctions.lua:467-475; components/scenariorunner.lua).

**Re-apply is mandatory, not optional.** DSTP must restore mutations itself every
world load, two viable patterns:
- **World-load flow** — on the world `startup`/first-`/dst/sync`, re-find the target
  entities (tag them at creation so they're queryable) and re-run the mutation flow.
  100% flow, no new Lua — fits DSTP's "flow > Lua" preference.
- **Boot `AddPrefabPostInit`** (the mod's own boot edit) — for a fixed set of prefab
  types, register a post-init at mod boot that re-mutates. Only for stable, schema-known
  reskins; the dynamic/per-instance case belongs in the world-load flow.

Tagging is the bridge: a runtime `AddTag('dstp_custom_mob')` is itself lost on reload,
so persistence must key off something durable (a DSTP-side registry of
position/prefab/mutation keyed by a stable id), then re-spawn-or-re-mutate on load.

---

## 5. A 'boot-time content pack' path — the only correct way to ship REAL new content

If DSTP genuinely wants new prefabs/recipes (not recombination), the only engine-correct
route is **register at mod boot from a config the panel writes**, accepting the cost:

1. **Panel writes a content-pack config** (JSON the mod reads, or generated Lua) into
   the installed mod folder — prefab defs (referencing assets that ship with the pack),
   recipes, tuning.
2. **The mod registers it at boot**, in the normal pipeline, BEFORE world load:
   `PrefabFiles` / `LoadPrefabFile` + `Recipe2()`/`AddRecipe2` from `modmain`, so the
   entries land in `Prefabs`/`AllRecipes` while the player_classified recipe-netvar
   loop (player_classified.lua:1527) and `ModManager:RegisterPrefabs` (gamelogic.lua,
   pre-`PopulateWorld`) still run identically on both ends.
3. **Hard requirements, stated honestly:**
   - **Server restart** — registration is boot-only; you cannot hot-add to a running
     world (§2, §3-trap).
   - **`all_clients_require_mod = true`** — every connecting client must download the
     mod (assets + the same prefab/recipe code) so its `Prefabs`/`AllRecipes`/netvar
     sets match the server (netvars.lua:29-32). This is a **client mod download**, by
     definition — the exact thing the live path avoids.
   - **Assets must physically exist** in the pack on disk (autocompiled PNG→TEX at
     build time; `resolvefilepath` asserts, mainfunctions.lua:119-125).

**Bound:** this is a *deploy* mechanism, not a *live* one. It turns "new content" into
"edit the mod's boot config, restart the server, clients re-download on next connect."
Worth it only for stable, curated packs — never for ad-hoc, per-session, or
players-already-connected scenarios, which remain firmly in the recombination surface
of §3.

---

## Capability matrix (quick reference)

| Capability | Verdict | Why (1-liner) | Source |
|---|---|---|---|
| Spawn an existing prefab live | **FEASIBLE-LIVE** | client has prefab+assets; replicates by name | mainfunctions.lua:347-411 |
| Reskin/recolor/rescale existing prefab | **FEASIBLE-LIVE** | AnimState/Transform engine-replicated | entityscript.lua; deerclops.lua SetBank/SetBuild |
| Add/remove tags live | **FEASIBLE-LIVE** | tags are replicated network state | entityscript.lua:556 |
| Make a thing workable (CHOP/MINE/HAMMER) | **FEASIBLE-LIVE** | tag-only collector, no replica deref | componentactions.lua:3034; entityscript.lua:181 |
| Custom mob (retune+reskin+swap brain/SG) | **FEASIBLE-LIVE** | server-sim + engine-replicated visuals | entityscript.lua:1103,1148 |
| Rename via `named` replica (if pre-existing) | **FEASIBLE-LIVE** | net_string built at construction | named_replica.lua |
| Season/clock/spawn-rate/timer knobs | **FEASIBLE-LIVE** | netvar-replicated or server-side | seasons.lua:72; worldsettingstimer.lua |
| TUNING edit | **FEASIBLE-LIVE\*** | per-use reads only; cached reads frozen | tuning.lua:3; combat.lua |
| Grant an existing recipe to a player | **FEASIBLE-LIVE** | netvar slot exists from boot | builder.lua:448,461 |
| Add replicatable component to live entity | **SERVER-ONLY-DESYNC** | replica/netvars off-baseline → crash | entityreplica.lua:5-25; entityscript.lua:610-647 |
| Make a chest a working container/machine | **SERVER-ONLY-DESYNC** | container/machine collectors deref nil replica | componentactions.lua:~299,531 |
| Register new prefab on the server | **SERVER-ONLY-DESYNC** | client `Can't find prefab` → -1 | mainfunctions.lua:347-358 |
| New asset-backed prefab/mob/machine | **NEEDS-CLIENT-MOD** | no asset/code push to connected client | mainfunctions.lua:119-125; netvars.lua:29-32 |
| New craftable recipe (in menu) | **BOOT-ONLY** | menu+netvars boot-built both sides | recipe.lua:178,200; player_classified.lua:1527 |
| New cooker recipe / character / action verb | **BOOT-ONLY / NEEDS-CLIENT-MOD** | boot tables indexed both sides | cooking.lua; modutil.lua; componentactions.lua |
| New worldgen/topology/setpiece | **BOOT-ONLY** | worldgen is a world-CREATE sim | gamelogic.lua PopulateWorld |
| Any runtime mutation surviving reload | **LOST-ON-RELOAD** | save = base prefab + component OnSave only | entityscript.lua:248; mainfunctions.lua:438-484 |

\* per-use reads only; call the per-entity setter via `call_component` to affect
already-spawned entities.

---

Confirmed: AnimState is a C++ engine object (`Entity.AddNetwork`/`AddNetworkProxy`, entityscript.lua:172-175); bank/build/anim are replicated at the engine level (no Lua net_string carries them), and the doc's constraint that the build must be an already-loaded asset is the correct reading — the engine replicates the *reference*, and a client lacking the build asset can't render it. The doc handles this correctly ("SetBuild('totally_new_build') no-ops/errors on clients lacking it").

I have verified all five riskiest claims and several supporting ones directly against source. The doc is accurate. Here is my adversarial critique.

---

## Critique & corrections

I attacked the five riskiest claims by reading vanilla source. **Verdict: the doc is correct on all five.** The walls are where it says they are, the FEASIBLE-LIVE escape hatches are genuinely live, and the crash trap is real and precisely characterized. Below are the verifications, three corrections/sharpenings, and one missing nuance — none of which overturn a verdict, but two of which tighten a mechanism the doc states slightly imprecisely.

### Verified correct (5 riskiest claims)

1. **The central wall — `SpawnPrefabFromSim` (§2.1, matrix row "Register new prefab").** CORRECT, verbatim. `mainfunctions.lua:351-358`: `local prefab = Prefabs[name]; if prefab == nil then print("Can't find prefab "..tostring(name)) ... return -1`. Client construction is by-name against the client's own `Prefabs`. No net path delivers a prefab def. Confirmed.

2. **The recipe-netvar wall (§2.3, "actively dangerous").** CORRECT and the doc's added emphasis (vs. the probes treating `Recipe()` as a no-op) is justified by source. `player_classified.lua:1527`: `for k, v in pairs(AllRecipes) do if IsRecipeValid(v.name) then inst.recipes[k] = net_bool(...) ...`. Per-recipe netvars are minted from `AllRecipes` at every `player_classified` construction. A live `Recipe()` shifts that table → the next-joining client's state entity is built off a different baseline → deserialization mismatch. The doc is right to rate this a crash risk, not inert.

3. **The tag-based workable escape hatch (§3 #2, matrix "Make a thing workable").** CORRECT, and the mechanism is even cleaner than the doc states — see correction (A) below for a precision fix. The chain is sound: `workable.lua:9,22` adds `<ACTION>_workable` tags; `RegisterComponentActions` (`componentactions.lua:3092-3098`) pushes the `workable` id into the `actioncomponents` net_bytearray and calls `:set()`, which replicates live (clients listen on `actioncomponentsdirty`, `entityscript.lua:195`); `workable` is a **core** component so its id is stable across both ends (`RemapComponentActions` runs identically at boot). FEASIBLE-LIVE stands.

4. **The replicatable-component crash trap (§3 trap, matrix "Add replicatable component to live entity").** CORRECT and fully load-bearing. `entityreplica.lua:75` `ReplicateEntity` is commented "Triggered on clients immediately after initial deserialization of tags **from construction**" and is invoked exactly once, from the C++ callback `ReplicateEntity(guid)` (`mainfunctions.lua:814-823`). The `actioncomponentsdirty` handler (`entityscript.lua:92-94`) only refreshes the id list — it never rebuilds a replica. So a late `_<name>` tag never creates `inst.replica.<name>`; `replica_mt.__index → ValidateReplicaComponent` (`entityscript.lua:210-211`, `entityreplica.lua:30-32`) returns `nil`. I confirmed the concrete crash site: the SCENE `container` collector hard-derefs with no guard — `componentactions.lua:297` `inst.replica.container:CanBeOpened()` → `nil:CanBeOpened()` → client crash. The trap is real.

5. **The save/load erasure (§4).** CORRECT. `entityscript.lua:248-252` `GetSaveRecord` seeds `{prefab = self.prefab}` (+ position + component OnSave). `mainfunctions.lua:440` `SpawnSaveRecord` re-runs `SpawnPrefab(saved.prefab,...)` — the BASE fn — then `SetPersistData`. The `scenariorunner` carve-out is verbatim ("a special component that's added based on save data, not prefab setup", `mainfunctions.lua:468`). Runtime tags/colour/scale/brain/added-components that no component's OnSave captures are gone on reload. Confirmed.

### Corrections / sharpenings

**(A) The workable citation points at the wrong table — fix the line, not the verdict.** The doc cites `componentactions.lua:3034` as "the workable action collector keys purely off tags." That line is the **`ISVALID`** validator (`workable = function(inst, action, right) return ... inst:HasTag(action.id.."_workable")`), which is the *secondary* gate. The thing that actually **collects** the work action is the `tool` EQUIPPED collector at `componentactions.lua:1804`/`2431`: it loops `TOOLACTIONS`, checks the *tool's* `<k>_tool` tag, and calls `target:IsActionValid(ACTIONS[k], right)`. `IsActionValid` (`entityscript.lua:3174-3201`) then walks the target's `actioncomponents` and fires the workable `ISVALID` validator. So the full live chain is **tool tag (`CHOP_tool`) on the doer + `actioncomponents` carrying `workable`'s id + target tag `CHOP_workable`** — all tags / a replicated bytearray, **zero replica deref**, exactly as the doc concludes. The verdict (FEASIBLE-LIVE, no crash) is right; the doc should cite `componentactions.lua:1804` (tool collector) + `entityscript.lua:3174` (`IsActionValid`) as the live path, with `:3034` as the validator. Minor but it's the load-bearing line for the headline escape hatch, so worth fixing.

**(B) One un-stated precondition on the workable hatch: the doer must hold a matching tool.** The tag-based collector only yields CHOP/MINE/HAMMER/DIG when the doer's equipped item has the `<ACTION>_tool` tag (`componentactions.lua:2436` `inst:HasTag(k.."_tool")`). Making a prop `CHOP_workable` does NOT give a bare-handed player a work action — they need an axe (etc.). HAMMER is the partial exception (hammering works via the same tool path with a hammer). This doesn't change FEASIBLE-LIVE, but the doc's "connected clients see and perform the work action immediately" should read "…immediately, when holding the matching tool." Otherwise a tester reports "it doesn't work" while bare-handed.

**(C) `AddComponent` of a replicatable component fires the crash earlier than the doc implies — at the deref, but the *desync* is immediate at the tag.** The doc says adding a replicatable component yields "off-baseline desync" via construction-time netvars. Sharper: `AddComponent` → `ReplicateComponent` (`entityscript.lua:631`, `entityreplica.lua:34-60`) on the master **only adds the `_<name>` tag and builds the replica server-side**; it does not mint new per-GUID netvars on the *client's* already-constructed entity. The client damage is the two-step the doc's trap section nails: (1) the `_<name>` tag replicates but triggers no `ReplicateEntity`, so no client replica; (2) any collector enabled by the same action-id update then nil-derefs. So "each replica declares construction-time netvars → off-baseline" slightly overstates the *netvar-count* angle for the live-add case — the realistic kill is the nil deref, not a netvar baseline mismatch on that entity. (The netvar-baseline argument is exactly right for the *recipe* case in §2.3, where the count is built in a loop at construction; the doc should keep that framing in §2.3 and lean on the nil-deref framing in the §3 trap.) Verdict unchanged: SERVER-ONLY-DESYNC / crash.

### Did the doc hand-wave the client experience? No — but one client-side claim deserves an explicit caveat

The doc's AnimState claim ("SetBank/SetBuild/SetMultColour replicate; build must be already-loaded") is correct: AnimState is a C++ networked object (`Entity.AddNetwork`, `entityscript.lua:172-175`); no Lua net_string carries bank/build (grep confirms none exists), so the engine replicates the *reference* and a client lacking the build can't render it. **Caveat to add:** `SetBuild`/`OverrideSymbol` to an asset the *spawned prefab's own* `assets`/`prefabs` list didn't pull in is the silent-failure case even when "the client has the prefab" — the client loaded only the assets that prefab declares. So "reskin a spider with a deerclops build" works only if some loaded prefab on the client already references the deerclops build (deerclops is common, so usually fine, but a rarely-loaded build will render as the default/missing on clients who never triggered its load). The doc's "already-loaded asset" wording covers this, but it's worth a one-line warning that "already-loaded" means *loaded on that client this session*, not merely *exists on disk*.

### No false-pessimism found; no wrong persistence claim; one capability worth adding

- I probed every BOOT-ONLY verdict for a live path and found none mis-rated. `RegisterSinglePrefab` being callable-live-but-useless (`mainfunctions.lua:103-141`, used by `ModReloadFrontEndAssets`) is correctly tagged SERVER-ONLY-DESYNC, not BOOT-ONLY — the doc gets the subtlety right.
- Persistence claims hold (verified §4 above).
- **Missing capability (minor, additive):** the doc lists `Builder:AddRecipe` grant-existing as FEASIBLE-LIVE (correct — `builder.lua:448-453` sets the pre-existing per-recipe netvar slot via `self.inst.replica.builder:AddRecipe`). The symmetric **`Builder:RemoveRecipe`** (`builder.lua:455-458`) is equally FEASIBLE-LIVE and worth a matrix row — DSTP can *revoke* a learned recipe live, same netvar-slot mechanism. Useful for the "temporary craft unlock" flow pattern.

**Bottom line:** the doc is rigorous and its verdicts survive adversarial source-checking. The only changes I'd insist on are cosmetic-but-load-bearing: fix the workable citation to point at the `tool` collector + `IsActionValid` (correction A) and add the "must hold matching tool" precondition (B), since those two are the headline FEASIBLE-LIVE claim and a naive reader will otherwise mis-test it. Everything rated SERVER-ONLY-DESYNC / BOOT-ONLY / NEEDS-CLIENT-MOD is correctly walled.
