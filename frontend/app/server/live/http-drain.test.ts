// Behavioral test for the #17 fix in DST_MOD/scripts/dstp/http.lua: the mod must
// drain its event queue ONLY after a confirmed /dst/sync POST, and HOLD events for
// retry when the POST fails (backend down) — no silent loss.
//
// We can't run DST, but http.lua is plain Lua with all deps injected via Init(), so
// we run the REAL module under fengari (Lua-in-JS) with mocked _G/core/collectors.
// The assertions live in a Lua harness (__lua__/http-drain-harness.lua) that drives
// Http.Start, fires success/failure QueryServer callbacks, and inspects the queue.
// This test just loads both files, runs the harness, and asserts it returns "OK".
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-ignore — fengari ships no types.
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari'

const MOD_DIR = join(import.meta.dir, '..', '..', '..', '..', 'DST_MOD', 'scripts', 'dstp')
const HARNESS = join(import.meta.dir, '__lua__', 'http-drain-harness.lua')

function runHarness(): string {
  const httpSrc = readFileSync(join(MOD_DIR, 'http.lua'), 'utf8')
  const harnessSrc = readFileSync(HARNESS, 'utf8')

  const L = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(L)

  // Expose the http.lua source to the harness as the global HTTP_SRC.
  lua.lua_pushstring(L, to_luastring(httpSrc))
  lua.lua_setglobal(L, to_luastring('HTTP_SRC'))

  // Load + run the harness; it returns one string.
  const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(harnessSrc))
  if (loadStatus !== lua.LUA_OK) {
    throw new Error('harness load error: ' + to_jsstring(lua.lua_tostring(L, -1)))
  }
  const callStatus = lua.lua_pcall(L, 0, 1, 0)
  if (callStatus !== lua.LUA_OK) {
    throw new Error('harness runtime error: ' + to_jsstring(lua.lua_tostring(L, -1)))
  }
  return to_jsstring(lua.lua_tostring(L, -1))
}

describe('mod http.lua — event queue drain/retry (#17)', () => {
  it('drains only after a confirmed POST, holds events on failure, drains by identity', () => {
    const result = runHarness()
    // The harness returns "OK" or "FAIL: <semicolon-joined failed checks>".
    expect(result).toBe('OK')
  })
})
