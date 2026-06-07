// ADVERSARIAL unit tests for datetime / try_catch / transform node handlers.
// Goal: find REAL bugs by feeding hostile inputs (out-of-range dates, circular
// JSON, Infinity/NaN arithmetic, non-Error throws, prototype-pollution payloads).
//
// Convention: every test asserts the SAFE/expected behavior. A passing test = good
// regression. A FAILING test marked `// BUG:` documents a real defect in the system
// (the handler crashes or does something dangerous) — we deliberately do NOT fix the
// handler here; the failing assertion pins the bug.
//
// Run: bun test app/server/live/adversarial-misc.test.ts
import { describe, it, expect } from 'bun:test'
import { makeRc } from './nodes/testkit'
import { handler as datetime } from '@shared/automation/nodes/data/transform/datetime/exec'
import { handler as tryCatch } from '@shared/automation/nodes/logic/branch/try_catch/exec'
import { handler as transform } from '@shared/automation/nodes/data/transform/transform/exec'

// Date's valid range is +/- 8,640,000,000,000,000 ms from epoch. One past that and
// `new Date(ms)` is an "Invalid Date" whose .toISOString() throws RangeError.
const DATE_MAX = 8.64e15

// ───────────────────────── datetime ─────────────────────────
describe('datetime — adversarial', () => {
  it('toMs: non-numeric non-date value falls back to now() (format echoes a valid ISO)', async () => {
    const spy = makeRc({ data: { params: { operation: 'format', value: 'abc' } } })
    await datetime(spy.rc)
    const o = spy.out()
    // "abc" is not a number nor a parseable date → now(); ISO must be valid/non-empty.
    expect(typeof o.iso).toBe('string')
    expect(o.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Number.isNaN(o.ms)).toBe(false)
  })

  it('toMs: a "numeric-looking" garbage like "0x10" is taken as the number 16, not now()', async () => {
    // Number('0x10') === 16, so this silently becomes epoch+16ms instead of now().
    // Surprising but not a crash — documents the silent coercion.
    const spy = makeRc({ data: { params: { operation: 'format', value: '0x10' } } })
    await datetime(spy.rc)
    expect(spy.out().iso).toBe('1970-01-01T00:00:00.016Z')
  })

  it('format: an invalid ISO date string ("2026-13-45") falls back to now() instead of crashing', async () => {
    const spy = makeRc({ data: { params: { operation: 'format', value: '2026-13-45' } } })
    await datetime(spy.rc)
    const o = spy.out()
    expect(o.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Number.isNaN(o.ms)).toBe(false)
  })

  it('format of an out-of-range timestamp does NOT crash (clamped, no RangeError)', async () => {
    // value just past the Date max → safeIso clamps instead of letting toISOString throw.
    const spy = makeRc({ data: { params: { operation: 'format', value: String(DATE_MAX + 1) } } })
    await expect(datetime(spy.rc)).resolves.toBeDefined()
    expect(typeof spy.out().value).toBe('string') // a valid ISO string, not a throw
  })

  it('add overflowing past the Date range does NOT crash (clamped)', async () => {
    const spy = makeRc({
      data: { params: { operation: 'add', value: String(DATE_MAX), amount: String(DATE_MAX), unit: 'ms' } },
    })
    await expect(datetime(spy.rc)).resolves.toBeDefined()
    expect(spy.out().iso).not.toBe('') // clamped to a valid ISO, not Invalid Date
  })

  it('add with amount="Infinity" is contained (Infinity guarded, no crash)', async () => {
    // Number('Infinity') is Infinity and truthy, so `|| 0` does NOT catch it — the
    // handler now uses Number.isFinite to coerce non-finite amounts to 0.
    const spy = makeRc({
      data: { params: { operation: 'add', value: '0', amount: 'Infinity', unit: 'ms' } },
    })
    await expect(datetime(spy.rc)).resolves.toBeDefined()
    expect(spy.out().ms).toBe(0) // Infinity amount → treated as 0 → stays at base
  })

  it('add: amount=NaN-ish "abc" is coerced to 0 (no movement, no crash)', async () => {
    // Number('abc') is NaN, NaN || 0 === 0 → result == base. Safe.
    const spy = makeRc({ data: { params: { operation: 'add', value: '5000', amount: 'abc', unit: 'minutes' } } })
    await datetime(spy.rc)
    expect(spy.out().ms).toBe(5000)
  })

  it('add: an unknown unit falls back to the 1000ms (seconds) multiplier', async () => {
    const spy = makeRc({ data: { params: { operation: 'add', value: '0', amount: '2', unit: 'fortnights' } } })
    await datetime(spy.rc)
    expect(spy.out().ms).toBe(2000) // 2 * (unknown → 1000)
  })

  it('diff: value > value2 yields a negative difference (no abs)', async () => {
    const spy = makeRc({ data: { params: { operation: 'diff', value: '10000', value2: '0', unit: 'seconds' } } })
    await datetime(spy.rc)
    expect(spy.out().value).toBe(-10) // (0 - 10000)/1000
  })

  it('diff: an unknown unit divides by 1000 (seconds fallback)', async () => {
    const spy = makeRc({ data: { params: { operation: 'diff', value: '0', value2: '5000', unit: 'lightyears' } } })
    await datetime(spy.rc)
    expect(spy.out().value).toBe(5)
  })

  it('diff: ms="" both sides → both now() → diff 0, and does not crash', async () => {
    const spy = makeRc({ data: { params: { operation: 'diff', value: '', value2: '', unit: 'seconds' } } })
    await datetime(spy.rc)
    expect(spy.out().value).toBe(0)
  })
})

// ───────────────────────── transform ─────────────────────────
describe('transform — adversarial', () => {
  it('div by zero is guarded → returns 0', async () => {
    const spy = makeRc({ data: { params: { operation: 'div', value: '10', operand: '0' } } })
    await transform(spy.rc)
    expect(spy.out().value).toBe(0)
  })

  it('div by NON-numeric operand ("abc") → n(operand)=0 → guarded to 0', async () => {
    const spy = makeRc({ data: { params: { operation: 'div', value: '10', operand: 'abc' } } })
    await transform(spy.rc)
    expect(spy.out().value).toBe(0)
  })

  it('mul/add with "Infinity" operand: Number("Infinity")||0 === Infinity (NOT contained → Infinity result)', async () => {
    // n() uses `Number(x) || 0`; Infinity is truthy so it survives. Documents that
    // Infinity is NOT sanitized by the `|| 0` guard (only NaN/0 are).
    const mul = makeRc({ data: { params: { operation: 'mul', value: '2', operand: 'Infinity' } } })
    await transform(mul.rc)
    expect(mul.out().value).toBe(Infinity)
    const add = makeRc({ data: { params: { operation: 'add', value: '2', operand: 'Infinity' } } })
    await transform(add.rc)
    expect(add.out().value).toBe(Infinity)
  })

  it('number: "0x10" → 16, "1e3" → 1000, " 12 " (padded) → 12', async () => {
    const hex = makeRc({ data: { params: { operation: 'number', value: '0x10' } } })
    await transform(hex.rc); expect(hex.out().value).toBe(16)
    const exp = makeRc({ data: { params: { operation: 'number', value: '1e3' } } })
    await transform(exp.rc); expect(exp.out().value).toBe(1000)
    const pad = makeRc({ data: { params: { operation: 'number', value: ' 12 ' } } })
    await transform(pad.rc); expect(pad.out().value).toBe(12)
  })

  it('number: non-numeric "abc" → 0 (the || 0 guard)', async () => {
    const spy = makeRc({ data: { params: { operation: 'number', value: 'abc' } } })
    await transform(spy.rc)
    expect(spy.out().value).toBe(0)
  })

  it('round: NaN-source → n()=0 → Math.round(0)=0 (NaN is sanitized); Infinity-source survives', async () => {
    const nan = makeRc({ data: { params: { operation: 'round', value: 'abc' } } })
    await transform(nan.rc)
    expect(nan.out().value).toBe(0) // Number('abc')=NaN, NaN||0=0, round(0)=0
    const inf = makeRc({ data: { params: { operation: 'round', value: 'Infinity' } } })
    await transform(inf.rc)
    expect(inf.out().value).toBe(Infinity) // round(Infinity)=Infinity (not contained)
  })

  it('json_parse of a non-string number input → String() then parse → the number itself', async () => {
    const spy = makeRc({ data: { params: { operation: 'json_parse' }, value: 42 } })
    await transform(spy.rc)
    expect(spy.out().value).toBe(42)
  })

  it('json_parse of invalid JSON → null (caught)', async () => {
    const spy = makeRc({ data: { params: { operation: 'json_parse', value: '{not json' } } })
    await transform(spy.rc)
    expect(spy.out().value).toBe(null)
  })

  it('json_parse of a __proto__ payload does NOT pollute Object.prototype', async () => {
    const spy = makeRc({ data: { params: { operation: 'json_parse', value: '{"__proto__":{"polluted":"yes"}}' } } })
    await transform(spy.rc)
    // JSON.parse puts __proto__ as an own prop; it must not leak to the global prototype.
    expect(({} as any).polluted).toBeUndefined()
    expect((Object.prototype as any).polluted).toBeUndefined()
  })

  it('json_stringify of a circular object does NOT crash (degrades to null, like json_parse)', async () => {
    const circular: any = { name: 'loop' }
    circular.self = circular
    const spy = makeRc({ data: { params: { operation: 'json_stringify' }, value: circular } })
    await expect(transform(spy.rc)).resolves.toBeDefined()
    expect(spy.out().value).toBeNull() // circular → null instead of a thrown TypeError
  })

  it('json_stringify of undefined → JSON.stringify(undefined) returns undefined (not a string)', async () => {
    const spy = makeRc({ data: { params: { operation: 'json_stringify' }, value: undefined } })
    await transform(spy.rc)
    expect(spy.out().value).toBeUndefined()
  })

  it('replace with EMPTY operand: split("") explodes the string char-by-char, then join → input unchanged', async () => {
    // "abc".split("") → ["a","b","c"]; .join("") → "abc". So empty operand is a no-op,
    // BUT if replacement were non-empty it would be inserted between every char.
    const noop = makeRc({ data: { params: { operation: 'replace', value: 'abc', operand: '' } } })
    await transform(noop.rc)
    expect(noop.out().value).toBe('abc')
    // Demonstrate the surprising fan-out when replacement is set + operand empty:
    const fanout = makeRc({ data: { params: { operation: 'replace', value: 'abc', operand: '', replacement: '-' } } })
    await transform(fanout.rc)
    expect(fanout.out().value).toBe('a-b-c') // documents the char-by-char insertion
  })

  it('replace treats $ as a LITERAL (split/join, not regex replace)', async () => {
    const spy = makeRc({ data: { params: { operation: 'replace', value: 'a$1b', operand: '$1', replacement: 'X' } } })
    await transform(spy.rc)
    expect(spy.out().value).toBe('aXb')
  })

  it('after: separator not present → returns input unchanged', async () => {
    const spy = makeRc({ data: { params: { operation: 'after', value: 'no-sep-here', operand: '::' } } })
    await transform(spy.rc)
    expect(spy.out().value).toBe('no-sep-here')
  })

  it('after/before with empty operand: indexOf("")===0 → after=whole, before=empty', async () => {
    const after = makeRc({ data: { params: { operation: 'after', value: 'hello', operand: '' } } })
    await transform(after.rc)
    expect(after.out().value).toBe('hello') // slice(0+0)
    const before = makeRc({ data: { params: { operation: 'before', value: 'hello', operand: '' } } })
    await transform(before.rc)
    expect(before.out().value).toBe('') // slice(0,0)
  })

  it('length: of a number/null/boolean → String coercion length; of an array → array length', async () => {
    const num = makeRc({ data: { params: { operation: 'length' }, value: 12345 } })
    await transform(num.rc); expect(num.out().value).toBe(5) // "12345"
    const nul = makeRc({ data: { params: { operation: 'length' }, value: null } })
    await transform(nul.rc); expect(nul.out().value).toBe(0) // null ?? '' → ''
    const boo = makeRc({ data: { params: { operation: 'length' }, value: true } })
    await transform(boo.rc); expect(boo.out().value).toBe(4) // "true"
    const arr = makeRc({ data: { params: { operation: 'length' }, value: [1, 2, 3] } })
    await transform(arr.rc); expect(arr.out().value).toBe(3)
  })

  it('length: of a plain OBJECT → "[object Object]".length === 15 (surprising but defined)', async () => {
    const spy = makeRc({ data: { params: { operation: 'length' }, value: { a: 1 } } })
    await transform(spy.rc)
    expect(spy.out().value).toBe('[object Object]'.length)
  })
})

// ───────────────────────── try_catch ─────────────────────────
describe('try_catch — adversarial throws', () => {
  it('try branch throws a STRING ("oops") → error captured as that string', async () => {
    const spy = makeRc({
      overrides: { followOutEdges: async (f?: any) => { if (f?.({ sourceHandle: 'try' })) throw 'oops'; return null } },
    })
    const res: any = await tryCatch(spy.rc)
    // String(undefined ?? 'oops') === 'oops'
    expect(spy.out()).toEqual({ ok: false, error: 'oops' })
    expect(res.followEdges({ sourceHandle: 'catch' })).toBe(true)
  })

  it('try branch throws NULL → String(null ?? null) === "null", no crash', async () => {
    const spy = makeRc({
      overrides: { followOutEdges: async (f?: any) => { if (f?.({ sourceHandle: 'try' })) throw null; return null } },
    })
    const res: any = await tryCatch(spy.rc)
    // err is null → err?.message is undefined → undefined ?? null → null → String(null) = "null"
    expect(spy.out().ok).toBe(false)
    expect(spy.out().error).toBe('null')
    expect(typeof res).toBe('object')
  })

  it('try branch throws a NUMBER (42) → String(42) === "42"', async () => {
    const spy = makeRc({
      overrides: { followOutEdges: async (f?: any) => { if (f?.({ sourceHandle: 'try' })) throw 42; return null } },
    })
    await tryCatch(spy.rc)
    expect(spy.out().error).toBe('42')
  })

  it('try branch throws an OBJECT without .message → String(obj) === "[object Object]"', async () => {
    const spy = makeRc({
      overrides: { followOutEdges: async (f?: any) => { if (f?.({ sourceHandle: 'try' })) throw { code: 500 }; return null } },
    })
    await tryCatch(spy.rc)
    // err.message undefined → falls to `err` → String({code:500}) = "[object Object]"
    expect(spy.out().error).toBe('[object Object]')
  })

  it('try branch returns a WAIT node → bubbles up as { wait } (not swallowed)', async () => {
    const fakeWait: any = { id: 'w1', type: 'wait', data: {}, position: { x: 0, y: 0 } }
    const spy = makeRc({
      overrides: { followOutEdges: async () => fakeWait },
    })
    const res: any = await tryCatch(spy.rc)
    expect(res).toEqual({ wait: fakeWait })
    expect(spy.out()).toEqual({ ok: true, error: '' }) // marked ok before the wait bubble
  })

  it('followOutEdges throws AFTER side effects already ran → catch still fires (effects are NOT rolled back)', async () => {
    // Documents that try_catch is NOT transactional: any pushCommand/setContext that the
    // inner branch performed before throwing has already happened. Here a command was
    // queued, then the branch throws — the command stays queued AND catch runs.
    const spy = makeRc({
      overrides: {
        followOutEdges: async (f?: any) => {
          if (f?.({ sourceHandle: 'try' })) {
            spy.rc.pushCommand('announce', { text: 'side effect' })
            throw new Error('after effect')
          }
          return null
        },
      },
    })
    const res: any = await tryCatch(spy.rc)
    expect(spy.commands).toEqual([{ type: 'announce', data: { text: 'side effect' } }]) // not rolled back
    expect(spy.out().error).toBe('after effect')
    expect(res.followEdges({ sourceHandle: 'catch' })).toBe(true)
  })
})
