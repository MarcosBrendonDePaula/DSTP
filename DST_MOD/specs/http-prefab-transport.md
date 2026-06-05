# HTTP Prefab Transport — Feasibility

> **Provenance:** multi-agent workflow `http-prefab-transport-feasibility` (4 adversarial probes of
> vanilla `/tmp/dstscripts/scripts` + synthesis + critic), prompted by the idea "send the prefab in
> bytes over HTTP". The critic VERIFIED the 5 make-or-break claims against source — see **Critique &
> verification** at the end. Its corrections apply: the `-1 → silent ghost` client outcome is
> UNKNOWN-ENGINE-SIDE / live-test-required (not proven), and Klump (`LoadKlumpString`) is a
> decrypt-already-shipped path, not a from-bytes loader.

**Question:** Can a DSTP server "send a prefab as bytes over HTTP" to a connected
client at runtime so NEW content appears **without** the client having installed the
Workshop mod?

**Status:** Investigated against vanilla DST scripts (4 independent probes). Every
claim below cites a function/API + `file:line`. Engine-internal behaviors that Lua
cannot observe are marked **UNKNOWN-ENGINE-SIDE** explicitly.

---

## 1. TL;DR

**Partly — and the split is sharp.** Transmitting a prefab **as Lua source** (a prefab
is just a Lua function) over HTTP, compiling it with `loadstring`, and registering it
live on both server and client **WORKS** — DSTP's relay already delivers HTTP bytes as a
Lua string, and `customcommands.lua` is the shipped precedent for loadstring-and-run from
a persisted file. Transmitting **structured DATA** (a JSON "content def") works equally
well. **But there is NO runtime Lua API anywhere in vanilla that turns a byte buffer — or
a file at an arbitrary path — into a renderable BINARY asset** (anim `.zip`/build,
`.tex`/KTEX atlas, `.fev`/`.fsb` sound bank). Asset loading is strictly **path-based**:
`Asset{type,file}` → `resolvefilepath` → `kleifileexists` over a fixed set of search
roots (`""` = install dir, `MODS_ROOT..modname` = installed mods), and the
`SetPersistentString` save/config dir we *can* write to is **not** one of those roots. So
the make-or-break fact is: **truly-new visuals and sounds cannot reach an un-modded
client via HTTP bytes** — they remain Workshop-only. What HTTP transport *can* deliver
live is new **behavior** and new **content that recombines/retints assets the client
already ships**.

---

## 2. The pipeline, stage by stage

| Stage | Lua code / data | New binary asset | Verdict line |
|-------|-----------------|------------------|--------------|
| RECEIVE | **WORKS** | CAVEAT (byte-cleanliness unknown) | bytes arrive as one Lua string |
| PERSIST | **WORKS** | **WALLED** | can write text; cannot write into an asset root |
| LOAD | **WORKS** (`loadstring`) | **WALLED** | no asset-from-bytes/arbitrary-path API |
| REGISTER | **WORKS-WITH-CAVEAT** | **WALLED** | `Prefabs[name]=` is pure Lua; assets assert on disk |
| REPLICATE | **WORKS-WITH-CAVEAT** | **WALLED** | both ends must register the name |
| RENDER | **WORKS** (existing assets) | **WALLED** | new pixels/audio have no loader |

### RECEIVE — **WORKS** (binary-cleanliness UNKNOWN-ENGINE-SIDE)
The HTTP body is handed to Lua as a single string in the `QueryServer` callback;
vanilla treats it as opaque text (length check → `json.decode`/`loadstring`).
- `TheSim:QueryServer(url, cb(result, isSuccessful, resultCode), method)` — `motdmanager.lua:496-499`; same shape `screens/mainscreen.lua:474`, `multiplayermainscreen.lua:949`. DSTP already does this: `DST_MOD/scripts/dstp/client.lua:179-184`.
- **CAVEAT (UNKNOWN-ENGINE-SIDE):** whether the string survives **non-UTF8 binary**
  intact is set by the C++ marshaller — no Lua source. Strong indirect signal it is
  *not* the intended path: when vanilla needs a binary image it does **not** pull bytes
  through `QueryServer`; it calls a dedicated engine fetch `TheSim:DownloadMOTDImage(url, image_file, cb)` (`motdmanager.lua:569`) that writes the file C++-side and returns only a boolean. The de-facto "binary over a Lua string" convention is `TheSim:ZipAndEncodeString`/`DecodeAndUnzipString` (base64+zip, `util.lua:1693-1714`) — its very existence is evidence raw bytes aren't assumed transport-safe.
- No Lua-visible size cap (callers only gate `resultCode==200` and `len>1`); any cap is engine-side (UNKNOWN). `DecodeAndUnzipString` caps *decoded instruction budget* at 2,000,000 (`util.lua:1703`) — a sandbox guard, not a transport limit.

### PERSIST — **WORKS** for Lua/text, **WALLED** for assets
- Writing a string to the save/config sandbox works and round-trips:
  `SavePersistentString` → `TheSim:SetPersistentString(name, data, encode, cb)` (`mainfunctions.lua:18-29`); round-trip proof `plantregistrydata.lua:106/117`.
- `../` escapes one level to the cluster/config root — vanilla reads `../customcommands.lua` (`mainfunctions.lua:1425`) and writes `../worldgenoverride.lua` (`mainfunctions.lua:971-977`). Shallow, **config-tree-scoped**.
- The `encode` (3rd) arg is a C++ **zip-on-write** flag, not a "give me arbitrary binary" mode — input is still a Lua string built from `DataDumper` text (`gamelogic.lua:806`, `COMPRESS_SERVER_SAVE_FILE=true`). It stores *compressed text*, not a foreign `.zip`/`.tex`.
- **WALLED:** there is **no** Lua API to write into `MODS_ROOT` or any registered asset root. `SetPersistentString` targets the save/config sandbox only; `MODS_ROOT`, `kleifileexists`, `ManifestManager` are C++ globals with no Lua definition. `main.lua:128-131` itself comments that writing lua into a mod dir needs `ManifestManager:AddFileToModManifest` and "isn't usually done". So bytes can land on disk — **but not where `SpawnPrefab`/`AnimState` will look.**

### LOAD — Lua **WORKS**, binary **WALLED**
- `loadstring` is native Lua 5.1, reachable from the mod env as `GLOBAL.loadstring` (`mods.lua:327` `env.GLOBAL=_G`). Precedent: `mainfunctions.lua:1428` loadstrings `../customcommands.lua` in the global env and runs it. (Note: `RunInSandboxSafe` runs in an **empty** env `setfenv {}` — fine for parsing *data tables*, useless for prefab code that needs `Prefab`/`AddComponent`; for real prefab code loadstring in the full `_G` as customcommands does.)
- Bytecode is blocked — `untrusted_code:byte(1)==27` → `"binary bytecode prohibited"` (`util.lua:798/809/824`). **Send Lua SOURCE, not compiled chunks.**
- **WALLED (binary):** exhaustive scan for `*FromString/*FromBuffer/*FromMemory/*FromBytes` on texture/atlas/build/anim/sound found **nothing** (only `map:SetNavFromString` = map grid, `TextEdit:OnRaw`, etc.). `Image:SetTexture` re-asserts disk existence — it calls `resolvefilepath(atlas)` (`widgets/image.lua:84-94`) and crashes on a missing atlas.
- **Klump is NOT a from-bytes loader:** `TheSim:LoadKlumpFile(path, cipher)` (`klump.lua:47-67`, `quagmire_recipebook.lua:105-109`) **decrypts a `.tex`/`.dyn` already shipped on disk**; only the small cipher KEY travels over `net_string`. Proves runtime asset *unlock* exists, not byte *injection*.

### REGISTER — pure-Lua prefab **WORKS-WITH-CAVEAT**; asset-bearing prefab **WALLED**
- Registration is almost pure Lua: `RegisterPrefabsImpl` sets `Prefabs[name]=prefab` then calls C++ `TheSim:RegisterPrefab(name, assets, deps)` (`mainfunctions.lua:103-141`). `Prefabs[]` is the table `SpawnPrefab` looks up, so a late-registered name is callable. Reachable via `GLOBAL.RegisterPrefabs`/`RegisterSinglePrefab`.
- **Late (mid-session) registration is engine-supported, not boot-only:** `ModPreloadAssets` builds a Prefab at runtime → `RegisterSinglePrefab` → `TheSim:LoadPrefabs({name})` (`mainfunctions.lua:198-247`); `LoadPrefabs`/`UnloadPrefabs` run on every world/screen/character switch (`gamelogic.lua:205-340,431-435`).
- **HARD WALL for any prefab that declares assets:** `RegisterPrefabsResolveAssets` runs `resolvefilepath` per asset and **asserts non-nil** — a missing `.zip`/`.tex`/`.fsb` **crashes** registration, it does not degrade. `mainfunctions.lua:119-123` (`assert(resolvedpath, "Could not find "..asset.file)`), `util.lua:636-643`. So the only safe Lua-only prefab declares **`Assets = {}`** (empty loop → no resolution → no crash) and reuses builds/atlases already on the client.
- **UNKNOWN-ENGINE-SIDE:** what C++ `TheSim:RegisterPrefab`/`LoadPrefabs` do with a genuinely-**never-before-seen** name late in a session — vanilla only ever re-registers boot-defined names. The Lua lookup table is fully populated and callable; the deep C++ acceptance is plausible but not provable from Lua.

### REPLICATE — **WORKS-WITH-CAVEAT** (both ends must register)
- A network-instantiated entity routes through C++ back into Lua `SpawnPrefabFromSim(name)`, which reads `Prefabs[name]`; if nil it logs "Can't find prefab" and **returns -1 → no entity** (`mainfunctions.lua:347-359`). So the same loadstring+register **must run on the client too** (over DSTP's existing relay channel).
- **UNKNOWN-ENGINE-SIDE:** exactly what the C++ net layer does on a -1 for an unknown networked prefab (most likely: entity simply doesn't instantiate locally — a ghost/desync, not a clean fallback), and whether component/netvar **replication** on a runtime-registered prefab behaves identically to a boot-registered one. Needs a live test.

### RENDER — existing assets **WORKS**; new pixels/audio **WALLED**
- A registered prefab whose `fn` reuses **already-loaded** assets spawns and renders normally: `SpawnPrefabFromSim` looks up `Prefabs[name]`, calls `prefab.fn(TheSim)`, returns a GUID (`mainfunctions.lua:347-397`). `AnimState:SetBuild("wilson")` etc. reference C++-cached builds — no `resolvefilepath` at spawn.
- **WALLED:** `AnimState:SetBuild/SetBank/AddOverrideBuild` and all `SetTexture` **select an already-loaded build/atlas by NAME** — they never load. `RegisterInventoryItemAtlas` only records a name→path mapping (`simutil.lua:654-664`); the `.xml/.tex` must still exist on disk.
- **UNKNOWN-ENGINE-SIDE:** behavior of `SetBuild` on an *unloaded* build / `PlaySound` on an *unregistered* FMOD event — pure C++ (`AnimState`/`SoundEmitter`). Lua's defensive patterns (`BuildHasSymbol` guards; `GetInventoryItemAtlas` falls back to shipped `inventoryimages4.xml`, `simutil.lua:683-696`) strongly imply **invisible/blank/silent**, not a crash — but this is *not* provable from Lua. (The one hard assert we *can* cite is the `resolvefilepath` path above at register time / `Image:SetTexture`.)

---

## 3. What HTTP transport CAN deliver live

This is the real, shippable subset. All of it reuses assets the client **already has on
disk** (base game, or a small "renderer" mod), so it sidesteps every binary-asset wall.

**(a) JSON "content def" + existing assets — ship today, zero new Lua walls.**
Transmit a creature/item/machine definition as DATA over the existing `net_string`
channels and render with base-game builds the client already loads. DSTP **already does
exactly this** in `DST_MOD/scripts/dstp/ui_widgets.lua` — `Image(node.atlas or "images/global.xml", node.tex or "square.tex")` (`:454`, pcall-guarded), `Text(ResolveFont(node.font),...)`, bars from `square.tex`, panels from `images/fepanel_fills.xml`; atlas/tex/font/scale/colour all arrive as data on `dstp.ui`/`dstp.pm` (`modmain.lua:108-116`). Extend the same model to **entity defs**: `{ base = "spider", build = "spider_build", tint = [r,g,b], scale = 1.4, stats = {...}, tags = [...] }` applied via `SetMultColour`/`SetScale` and component overrides on a base prefab.

**(b) Lua SOURCE for behavior / pure-logic prefabs.**
Transport prefab Lua source over HTTP, `GLOBAL.loadstring` it (the mod's `execute`
command already does this class of call), and register it into `Prefabs[name]`
(`RegisterSinglePrefab` → `Prefabs[]`). Spawnable via `SpawnPrefabFromSim`.
**Constraint:** the prefab's `Assets` must be **empty or reference only existing
base-game files** — the instant an `Asset{}` points at a new file, registration asserts
and crashes (`mainfunctions.lua:122`).

**(c) Hybrid (Lua prefab + JSON skin-config, assets constrained to base-game).**
Real new items/mobs/machines that render, as long as they reuse existing
banks/builds/atlases. Falls off the cliff the instant it needs new geometry/pixels/audio.

**The client-registration step (and its risks).** Because replication routes through
`SpawnPrefabFromSim(name)` (`mainfunctions.lua:347-359`), **both server and client must
register the identical name** — run the same loadstring+register on the client over the
relay before the server spawns it. Risks, all needing a live test:
- Unknown name on the client → `-1`, entity silently doesn't spawn (desync/ghost), **not** a graceful fallback.
- Whether a runtime-registered (never-at-boot) name is fully accepted by C++ `RegisterPrefab`/`LoadPrefabs` — **UNKNOWN-ENGINE-SIDE**.
- Whether components/netvars replicate identically on a runtime-registered prefab — **UNKNOWN-ENGINE-SIDE**.

---

## 4. What it CANNOT deliver

**Any genuinely NEW binary asset to a client that lacks it:** a new `.zip`
animation/build, a new KTEX/`.tex` art atlas, a new minimap/inventory icon, a new
`.fev`/`.fsb` sound bank.

**Why:** there is no runtime asset-from-bytes API and no way to add a writable directory
to the asset search path from a flow. `Asset{type,file}` carries a **path string, never
bytes** (`prefabs.lua:25-28`); resolution walks `package.assetpath` = `{path=""}` (install)
+ `{path=MODS_ROOT..modname}` per **enabled** mod (`mods.lua:438/575`) and calls C++
`kleifileexists` (`util.lua:585-642`); for Workshop mods it goes through a **baked C++
manifest** (`ManifestManager`), so even a freshly-written file is invisible without
`ManifestManager:AddFileToModManifest` (a C++ entry Klei flags as essentially never
used). `Image:SetTexture` re-asserts the atlas resolves (`image.lua:84-94`). Klump
decrypts pre-shipped files only (`klump.lua`). `ZipAndEncodeString`/`DecodeAndUnzipString`
carry **serialized Lua tables**, not renderable pixels (`util.lua:1693-1714`).

**The honest consequence:** a transmitted "new creature" is a **retinted / rescaled /
recomponented existing build** — not a brand-new sprite. New art = new bytes on disk in a
search root = no Lua route.

*(One narrow runtime image loader exists but doesn't change this: `TheSim:DownloadMOTDImage` (`motdmanager.lua:569`) fetches a URL image and the C++ side auto-builds a matching `.xml` atlas so a normal `Image` widget shows it — but it is hardwired to the MOTD panel, yields a single **flat 2D image** (no animated build/bank), and you don't control the atlas/tex naming. Whether it can be repurposed for in-world widgets is **UNKNOWN-ENGINE-SIDE**. Not a general "render my bytes" API.)*

---

## 5. The sanctioned alternative — Workshop auto-download

The **only** engine-supported way to put NEW binary assets on a client that never
installed the mod is the **Steam Workshop server-mod auto-download at connect**:
- `DownloadMods(server_listing)` → per required mod, `TheSim:QueueDownloadTempMod(mod.mod_name, mod.version)`; if not on Workshop → `needed_mods_in_workshop=false`; then `TheSim:StartDownloadTempMods(cb)` (`networking.lua:346-455`).
- Server side: `TheNet:ServerModSetup(product_id)` (a **Workshop ID**, not a URL), `TheNet:DownloadServerMods()` (`mods.lua:360-401`).
- The code's own failure string proves the boundary (`networking.lua:482`): the required mods *"don't exist on the Workshop. You will need to download them manually."* There is **no arbitrary-URL or byte-buffer variant** — `product_id` is a Workshop product.

**When DSTP should use this instead:** any feature requiring genuinely new art, new
animations, new icons, or new sound. Ship those as a **published Workshop mod** (DSTP is
already published as ID `3737234840`) and let the server's mod list pull it on join. The
HTTP/relay channel then carries only the **live data/config** that drives that
already-installed art.

---

## 6. Recommendation — concrete design

A two-tier model bounded by the probe verdicts:

**Tier 1 — "DSTP Content Def" over the existing sync channel (do this).**
Define a JSON content-def format shipped on `/dst/sync` / `net_string`, and a
client-side **applier** that builds the entity from base-game assets only:

```jsonc
{
  "id": "dstp_redspider",
  "base": "spider",            // existing prefab to clone/extend
  "build": "spider_build",     // EXISTING build, selected by name (SetBuild)
  "bank":  "spider",           // EXISTING bank (SetBank)
  "tint":  [1.0, 0.3, 0.3, 1], // SetMultColour
  "scale": 1.4,                // SetScale
  "stats": { "health": 400, "damage": 30 },
  "tags":  ["epic"],
  "components": { "lootdropper": { "SetLoot": ["monstermeat","silk"] } }
}
```
- **Apply path:** server registers the derived prefab (empty `Assets`, fn reuses `base`'s build/bank); pushes the same def to the client over the relay so the client runs the identical register before any spawn (`SpawnPrefabFromSim` needs `Prefabs[name]` on **both** ends — `mainfunctions.lua:347-359`).
- **Bounds:** every visual/audio reference must be an **existing** asset (probe: asset-bearing register asserts on disk, `mainfunctions.lua:122`). Verdict: **WORKS** for render (reuses loaded builds), **WORKS-WITH-CAVEAT** for register/replicate (runtime-registered-name acceptance + netvar replication are UNKNOWN-ENGINE-SIDE — gate behind a live test before relying on networked spawns).

**Tier 2 — bytes-of-Lua for behavior (optional, same trust class as `execute`).**
For new *logic* (new components/brains/pure-data prefabs), transmit Lua **source** over
HTTP and `GLOBAL.loadstring`+register it, exactly as the mod's `execute` already does
(bytecode rejected — `util.lua:798`). Same admin-trust gate as `script`/`call_component`
(an admin drew the flow). Still constrained to existing assets.

**Tier 3 — Workshop pack for real art (when Tier 1/2 can't).**
Genuinely new sprites/anims/sound → ship in the published Workshop mod and rely on the
server-mod **auto-download** at connect (`networking.lua`/`mods.lua`). The sync channel
then carries only the data that animates that art.

**One-line rule:** *Send data and behavior over HTTP; reuse the pixels the client already
has; ship genuinely new pixels through the Workshop.* DSTP's existing `ui_widgets.lua`
data-driven renderer (`:454/471/516/554`) is the working proof of Tier 1 — extend it from
UI widgets to in-world entity defs.

---

### Verdict summary

| Capability | Verdict |
|---|---|
| Receive HTTP bytes as a Lua string | **WORKS** (binary-cleanliness UNKNOWN-ENGINE-SIDE) |
| Persist a `.lua`/text file (save/config tree) | **WORKS** |
| Persist a file into an asset root (`MODS_ROOT`) | **WALLED** (no API) |
| `loadstring` a transmitted prefab (Lua source) | **WORKS** |
| Register a pure-Lua prefab (empty/existing assets) | **WORKS-WITH-CAVEAT** |
| Register a prefab referencing a NEW asset file | **WALLED** (asserts/crashes) |
| Replicate a runtime-registered name to client | **WORKS-WITH-CAVEAT** (both ends register; -1 on unknown) |
| Render reusing already-loaded builds/atlases | **WORKS** |
| Load a NEW `.tex`/`.zip`/`.fsb` from bytes or arbitrary path | **WALLED** (no API) |
| Get NEW binary assets onto an un-modded client | **WALLED** — Workshop auto-download only |

---

Confirmed: `TheSim:DownloadMOTDImage(data.image_url, data.image_file, cb)` (motdmanager.lua:569) — the C++ side fetches a URL, writes to `image_file`, returns a result boolean to the callback. The Lua never touches bytes. This is the one narrow runtime image fetch, hardwired to the MOTD panel as the doc states. I now have every claim verified. Here is my critique.

## Critique & verification

I had access to the full vanilla DST script tree at `/tmp/dstscripts/scripts` (2582-line `mainfunctions.lua`, `mods.lua`, `util.lua`, `networking.lua`, `motdmanager.lua`, `klump.lua`, `simutil.lua`, `prefabs.lua`, `widgets/image.lua`, `gamelogic.lua`). I verified every make-or-break claim directly against source. The doc is **substantially correct** — the sharp Lua-code-WORKS / binary-asset-WALLED split holds. Below are the five requested verdicts plus corrections where the doc is imprecise or over-optimistic.

### (1) Can `RegisterPrefabs` run at runtime on the CLIENT without crashing when assets are absent? — **CONFIRMED (with the exact mechanism)**

`RegisterPrefabsImpl` (`mainfunctions.lua:103-117`) loops `prefab.assets`; for each it calls `resolve_fn`. The default `RegisterPrefabsResolveAssets` (`:119-125`) does:
```
local resolvedpath = resolvefilepath(asset.file, ...)
assert(resolvedpath, "Could not find "..asset.file.." required by "..prefab.name)
```
So **a prefab declaring an asset whose file isn't on disk hard-asserts (crashes) at register time** — `resolvefilepath` itself also asserts (`util.lua:641`). But `RegisterPrefabsImpl` only enters the loop `for i,asset in ipairs(prefab.assets)` — **an empty `assets={}` table means zero iterations, zero resolution, no assert**. Then `Prefabs[prefab.name] = prefab` (`:114`) and `TheSim:RegisterPrefab(name, assets, deps)` (`:116`). The doc's claim — *only a prefab with empty/already-existing assets registers safely at runtime* — is exactly right.

Late/runtime registration being engine-supported is also confirmed: `RegisterSinglePrefab` (`:139-141`) is called at runtime by `ModPreloadAssets`/`ModReloadFrontEndAssets` (`:198-247`) followed by `TheSim:LoadPrefabs({name})`, and `LoadPrefabFile` (`:145-180`) `RegisterSinglePrefab`s mid-session. **CONFIRMED.**

One caveat the doc states correctly: whether C++ `TheSim:RegisterPrefab`/`LoadPrefabs` fully accept a **never-seen-at-boot** name is **CANT-TELL-FROM-LUA** — both are C++ with no script body. The Lua-side lookup table (`Prefabs[name]`) is populated and callable; the C++ acceptance is plausible but unprovable from script.

### (2) Is there REALLY no Lua API to load a `.tex`/`.zip` from bytes/arbitrary path at runtime? — **CONFIRMED (absence proven by enumerating the entire surface)**

I enumerated **every** `TheSim:*` method referenced anywhere in the script tree. The complete asset-related surface is: `LoadPrefabs / UnloadPrefabs / RegisterPrefab / SpawnPrefab / LoadFont / UnloadFont / PreloadFile / LoadKlumpFile / LoadKlumpString / AtlasContains / AddTextureToStreamingGroup / SetErosionTexture / SetHoloTexture / DownloadMOTDImage / LoadMOTDImage / GetMOTDImage / OnAssetPathResolve`. **Not one** is a `*FromBytes/*FromBuffer/*FromMemory/CreateTexture/LoadTextureFromImage`. Every loader takes a **name or path** that flows through `resolvefilepath` → `package.assetpath` → C++ `kleifileexists` (`util.lua:585-642`).

`package.assetpath` is fixed: `{path=""}` (install dir, `main.lua:4`) plus `{path=MODS_ROOT..modname}` per **enabled** mod (`mods.lua:438`, `:575`). `SetPersistentString`'s save/config sandbox is **not** in that list — confirmed.

Every `*FromString` in the tree is a **map tile grid** (`map:SetFromString`/`SetMapDataFromString`, `gamelogic.lua:493-526`) or a `GroundCreep:SetFromString` (tile data) or a string-table random index — **none load a texture/build/sound**. `RegisterInventoryItemAtlas` (`simutil.lua:654-664`) is a pure `imagename→atlas` table insert; it never loads, and `GetInventoryItemAtlas` falls back to the shipped `inventoryimages4.xml` (`:674`). `Image:SetTexture` re-asserts via `resolvefilepath(atlas)` when atlas is a string (`widgets/image.lua:88`). **The absence is proven.**

**Klump correction (the doc undersold one detail but the conclusion holds):** `LoadKlumpString` (`klump.lua:58`) is a real second entry the doc only briefly mentioned — but its **first argument is still a klump key/path** (`"STRINGS.NAMES.X"`, `klump.lua:36`, `quagmire_recipebook.lua:109`), used only for the `is_strings` branch. The actual `.tex`/`.dyn` art always goes through `LoadKlumpFile` with a **filename** already shipped on disk; only the **cipher** travels over `net_string`. So Klump is a runtime **decrypt-already-shipped-bytes** path, **not** a byte-injection path. Doc's conclusion stands; its citation set should add `LoadKlumpString`/`klump.lua:58` so a reader doesn't think the name implies from-string bytes.

### (3) Does the client instantiate replicated entities by NAME, and what happens if unknown? — **CONFIRMED for the Lua bridge; the network layer itself is CANT-TELL-FROM-LUA, and the doc is slightly over-precise about which function**

`SpawnPrefabFromSim(name)` (`mainfunctions.lua:347-359`) reads `Prefabs[name]`; if nil it `print("Can't find prefab "..name)` and `return -1`. **Crucially, this function has ZERO Lua callers** (I grepped the whole tree) — it is invoked by the C++ sim, confirming it is the engine→Lua instantiation bridge. So the doc's core claim — *the client must have `Prefabs[name]` registered or instantiation yields -1/no entity* — is **CONFIRMED**.

**Two honesty corrections:**
- The doc treats `SpawnPrefabFromSim` as THE network spawn path. The **direct** spawn `SpawnPrefab` (`:403-411`) routes through `TheSim:SpawnPrefab` (C++, `:409`) — a *different* path. Which one the netcode uses for a replicated entity is **CANT-TELL-FROM-LUA**. The safe statement is: *at least one Lua-visible instantiation path (`SpawnPrefabFromSim`) name-looks-up `Prefabs[]` and returns -1 on miss; the C++ net layer's exact behavior on an unknown networked prefab is not observable from script.* The doc's "-1 → silent ghost/desync" is a **reasonable inference, not a proven fact** — it should be labeled UNKNOWN-ENGINE-SIDE more firmly than it is.
- The doc is right that this means **both ends must register the identical name**, and right that there's no proof netvar/component replication behaves identically for a runtime-registered prefab. Flag as live-test-required. **This is the single biggest practical risk and the doc treats it appropriately.**

### (4) Can `SetPersistentString` write outside the save sandbox (the `../` escape)? — **CONFIRMED, but "outside the sandbox" is overstated — it's a one-level escape into the config/cluster tree, still NOT an asset root**

`SavePersistentString` → `TheSim:SetPersistentString(name, data, encode, cb)` (`mainfunctions.lua:18-29`). Vanilla writes `"../worldgenoverride.lua"` (`:971-977`, via `SetPersistentString`/`SetPersistentStringInClusterSlot`) and reads `"../customcommands.lua"` (`:1425`). So `../` **does** escape one directory level — **CONFIRMED**. But this lands in the **cluster/config tree**, which is gated by `TheSim:CanWriteConfigurationDirectory()` (`:1419`) and is **not** in `package.assetpath`. The doc states this correctly ("config-tree-scoped", "not an asset root"). No correction needed — just emphasizing the doc does NOT overclaim here; the escape is real but useless for asset injection. The `encode` arg is a C++ zip-on-write flag over a Lua string, not an arbitrary-binary mode (consistent with `COMPRESS_SERVER_SAVE_FILE`, `gamelogic.lua`). **CONFIRMED.**

### (5) Is `loadstring` available in the CLIENT mod env? — **CONFIRMED (via `GLOBAL`, not directly), and bytecode is rejected**

The mod env table (`mods.lua:301-330`) does **not** list `loadstring` directly, but sets `GLOBAL = _G` (`:327`). So `GLOBAL.loadstring`, `GLOBAL.RegisterPrefabs`, `GLOBAL.SpawnPrefab`, `GLOBAL.RegisterSinglePrefab` are all reachable — matching DSTP's documented `GLOBAL.`-prefix pattern and the `execute` command. The `customcommands.lua` precedent loadstrings in the full `_G` and `xpcall`s it (`mainfunctions.lua:1428-1430`) — **loadstring-and-run from a transmitted string is a shipped pattern.** **CONFIRMED.**

Bytecode is blocked by `untrusted_code:byte(1) == 27` in all three sandbox runners (`util.lua:798/809/824`) — but note that's only inside `RunInSandbox*`. **Raw `GLOBAL.loadstring(str)` (as `customcommands` and the `execute` cmd use) does NOT apply the byte-27 check** — that guard is opt-in via the sandbox wrappers. The doc says "send Lua SOURCE, not compiled chunks" which is the right operational advice, but the reason is *Klei's sandbox helpers* reject bytecode, not loadstring itself. Minor precision point; the practical guidance is correct.

### Over-optimism flags (client experience)

1. **`RunInSandboxSafe` is the wrong tool and the doc says so — good.** It `setfenv(fn, {})` (`util.lua:812`) — an **empty** env. Prefab code needs `Prefab`, `AddComponent`, `Asset`, etc. from `_G`, so it must use raw `GLOBAL.loadstring` in `_G` like `customcommands` does (`mainfunctions.lua:1428`). The doc flags this correctly.

2. **"-1 → silent ghost/desync, not a crash" is an inference, not proven.** The Lua returns -1; what the C++ net layer renders for a missing networked entity is unobservable from script. The doc mostly labels this UNKNOWN-ENGINE-SIDE but in the recommendation section it reads more confidently than the evidence supports. **A networked prefab that exists on server but not client is the most likely failure to produce visible breakage** (entity simply absent locally / interaction desync) — should be the #1 live-test item.

3. **The doc's strongest, fully-proven wall is correct and is the headline:** new pixels/anims/sound require new bytes in an asset search root; there is no Lua route to put them there and no from-bytes loader. Workshop auto-download (`TheSim:QueueDownloadTempMod`, `networking.lua:415`; error path `:482` "don't exist on the Workshop") is the only sanctioned channel, and `product_id`/`mod_name` is a Workshop ID with no arbitrary-URL variant (`mods.lua:361-362`). **CONFIRMED.** `TheSim:DownloadMOTDImage(url, image_file, cb)` (`motdmanager.lua:569`) is the lone runtime URL→image fetch, hardwired to the MOTD panel, C++-side file write, flat 2D only — the doc's caveat is accurate.

### Net assessment

The feasibility doc's verdict table is **sound**. Required edits: (a) cite `LoadKlumpString`/`klump.lua:58` when discussing Klump so the name isn't mistaken for a from-string loader; (b) downgrade the "-1 → silent ghost" client-experience claim from near-certain to UNKNOWN-ENGINE-SIDE / live-test-required; (c) note that `SpawnPrefabFromSim` is *a* (Lua-visible) instantiation bridge with no Lua callers, while `SpawnPrefab`→`TheSim:SpawnPrefab` is a separate C++ path whose net behavior is unobservable; (d) clarify the byte-27 bytecode reject lives in `RunInSandbox*`, not in bare `loadstring`. None of these change the bottom line: **Lua source + JSON data over HTTP WORKS and is shippable; genuinely new binary assets to an un-modded client are WALLED, Workshop-download-only.**

Source root used: `/tmp/dstscripts/scripts` (vanilla DST, accessible only via the Bash sandbox FS — the Read/Grep tools on this Windows host could not see that path, so all citations were pulled via Bash).
