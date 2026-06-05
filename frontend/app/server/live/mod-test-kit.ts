// DSTP mod test kit (JS runner). Runs REAL DST mod Lua modules under fengari
// (Lua-in-JS) so we can assert their BEHAVIOR — not just their structure — without
// a running DST client. See http-drain.test.ts / debounce.test.ts for usage.
//
// The model: the mod modules take all deps via Init() (no global require at file
// top), so each one is just a chunk we `load()` and call. We inject each module's
// source as a Lua global MOD_<NAME>, prepend __lua__/kit.lua (shared mock _G +
// assertion helpers), then run a small Lua `harness` string that wires the mocks,
// drives the module, and returns "OK" or "FAIL: <reasons>". JS reads that one string
// — no Lua<->JS table marshalling needed (fengari-interop isn't installed).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-ignore — fengari ships no types.
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari'

const HERE = import.meta.dir
const MOD_DIR = join(HERE, '..', '..', '..', '..', 'DST_MOD', 'scripts', 'dstp')
const KIT_LUA = readFileSync(join(HERE, '__lua__', 'kit.lua'), 'utf8')

// Read a mod module's source by path relative to DST_MOD/scripts/dstp.
export function modSource(rel: string): string {
  return readFileSync(join(MOD_DIR, rel), 'utf8')
}

export interface HarnessSpec {
  // Mod sources to expose, keyed by NAME → injected as Lua global MOD_<NAME>.
  // e.g. { CORE: modSource('core.lua') } → available in Lua as MOD_CORE.
  modules: Record<string, string>
  // The Lua harness body. It can `require`-style access the kit via the global KIT
  // (already set up) and the module sources via MOD_<NAME>. Must end by returning a
  // string ("OK" or "FAIL: ..."). The kit + a `local KIT = _KIT` are prepended.
  harness: string
}

// Run a harness and return its final string. Throws on Lua load/runtime errors.
export function runLuaHarness(spec: HarnessSpec): string {
  const L = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(L)

  // Inject module sources as MOD_<NAME> globals.
  for (const [name, src] of Object.entries(spec.modules)) {
    lua.lua_pushstring(L, to_luastring(src))
    lua.lua_setglobal(L, to_luastring('MOD_' + name))
  }

  // Build the full program: kit (returns KIT) assigned to _KIT, then the harness.
  // The kit's `return KIT` makes it a chunk we call and stash in a global so the
  // harness can reach it as KIT.
  const program =
    'local _KIT = (function()\n' + KIT_LUA + '\nend)()\n' +
    'KIT = _KIT\n' +
    spec.harness

  const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(program))
  if (loadStatus !== lua.LUA_OK) {
    throw new Error('harness load error: ' + to_jsstring(lua.lua_tostring(L, -1)))
  }
  const callStatus = lua.lua_pcall(L, 0, 1, 0)
  if (callStatus !== lua.LUA_OK) {
    throw new Error('harness runtime error: ' + to_jsstring(lua.lua_tostring(L, -1)))
  }
  const result = lua.lua_tostring(L, -1)
  return result ? to_jsstring(result) : '<no result>'
}
