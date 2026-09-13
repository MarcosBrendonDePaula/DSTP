// modmain.lua runs inside DST's MOD ENVIRONMENT, which exposes only a subset of the
// Lua globals (ipairs/pairs/type/tostring/math/string/table… yes; tonumber, pcall,
// require, os, io… NO — they must go through GLOBAL.*). A bare call to a missing one
// is "attempt to call global 'tonumber' (a nil value)" at mod load, which kills the
// dedicated server before the world starts (2026-09-12: exactly that, modmain:28).
// fengari cannot run modmain, so this is a static guard.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { modSource } from './mod-test-kit'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MODMAIN = readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'DST_MOD', 'modmain.lua'), 'utf8')

// Globals that are NOT in the mod env — every use must be GLOBAL.<name>.
// (`require`, `ipairs`, `pairs`, `type`, `tostring`, `math`, `string`, `table` ARE
// provided — the pre-2026-09 modmain called them bare for years.)
const NOT_IN_MOD_ENV = ['tonumber', 'pcall', 'xpcall', 'loadstring', 'setfenv', 'unpack']

function bareUses(src: string, name: string): string[] {
  const hits: string[] = []
  const re = new RegExp(`(^|[^.\\w])${name}\\s*\\(`)
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/--.*$/, '')   // strip comments
    if (re.test(code) && !new RegExp(`GLOBAL\\.${name}\\s*\\(`).test(code)) hits.push(`${i + 1}: ${line.trim()}`)
  })
  return hits
}

describe('modmain.lua — only mod-env globals are called bare', () => {
  for (const name of NOT_IN_MOD_ENV) {
    it(`never calls '${name}' without GLOBAL.`, () => {
      expect(bareUses(MODMAIN, name)).toEqual([])
    })
  }
  it('sanity: the guard sees a bare call when there is one', () => {
    expect(bareUses('local n = tonumber(x)\nlocal m = GLOBAL.tonumber(y)', 'tonumber')).toEqual(['1: local n = tonumber(x)'])
  })
  it('modSource still resolves the mod dir (kit wiring intact)', () => {
    expect(modSource('core.lua').length).toBeGreaterThan(100)
  })
})
