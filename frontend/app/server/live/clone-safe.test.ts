// Unit tests for cloneSafe — the guard that makes a flow's execution context/trace
// survive the worker→main postMessage (structured clone) without throwing.
//
// The core guarantee under test: for ANY input, structuredClone(cloneSafe(input))
// must not throw. We assert that directly (the "would have crashed the worker"
// reproduction) plus the per-type conversions.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { cloneSafe } from './clone-safe'

// Asserts the result is actually clone-safe (the whole point) AND returns it.
function expectCloneable<T>(value: T): T {
  expect(() => structuredClone(value)).not.toThrow()
  return value
}

describe('cloneSafe — primitives pass through', () => {
  it('keeps strings, numbers, booleans, null, undefined, bigint', () => {
    expect(cloneSafe('hi')).toBe('hi')
    expect(cloneSafe(42)).toBe(42)
    expect(cloneSafe(true)).toBe(true)
    expect(cloneSafe(null)).toBe(null)
    expect(cloneSafe(undefined)).toBe(undefined)
    expect(cloneSafe(10n)).toBe(10n)
  })
})

describe('cloneSafe — non-cloneable leaves become markers', () => {
  it('replaces a named function', () => {
    function doThing() {}
    expect(cloneSafe(doThing)).toBe('[Function: doThing]')
  })

  it('replaces an anonymous function', () => {
    expect(cloneSafe(() => {})).toMatch(/^\[Function: /)
  })

  it('replaces a symbol', () => {
    expect(cloneSafe(Symbol('tok'))).toBe('[Symbol: tok]')
  })

  it('replaces a Promise', () => {
    const r = cloneSafe(Promise.resolve(1))
    expect(r).toBe('[Promise]')
  })

  it('replaces an AbortSignal (the real-world offender)', () => {
    const ac = new AbortController()
    expect(cloneSafe(ac.signal)).toBe('[AbortSignal]')
  })
})

describe('cloneSafe — exotic objects degrade gracefully', () => {
  it('normalizes an Error to a plain object', () => {
    const e = new Error('boom')
    const out = cloneSafe(e) as any
    expect(out.name).toBe('Error')
    expect(out.message).toBe('boom')
    expect(typeof out.stack).toBe('string')
    expectCloneable(out)
  })

  it('catches a throwing getter without aborting the whole clone', () => {
    const obj = {
      good: 1,
      get bad(): number {
        throw new Error('nope')
      },
    }
    const out = cloneSafe(obj) as any
    expect(out.good).toBe(1)
    expect(out.bad).toMatch(/^\[Unreadable: /)
    expectCloneable(out)
  })

  it('handles a Proxy whose traps throw (like the vault accessors)', () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('proxy ownKeys trap')
        },
        get() {
          throw new Error('proxy get trap')
        },
      },
    )
    const out = cloneSafe({ env: proxy }) as any
    // The whole clone must still succeed; the proxy field degrades to a marker
    // (either flavor — a throwing get trap surfaces as Unreadable, a throwing
    // ownKeys/enumeration trap as Uncloneable; both are clone-safe markers).
    expect(out.env).toMatch(/^\[(Uncloneable|Unreadable): /)
    expectCloneable(out)
  })
})

describe('cloneSafe — containers', () => {
  it('recurses arrays and objects, sanitizing leaves', () => {
    const fn = () => {}
    const out = cloneSafe({ a: [1, fn, { b: 2 }] }) as any
    expect(out.a[0]).toBe(1)
    expect(out.a[1]).toMatch(/^\[Function: /)
    expect(out.a[2].b).toBe(2)
    expectCloneable(out)
  })

  it('preserves Map and Set (sanitizing entries)', () => {
    const m = new Map<any, any>([['k', 1], ['fn', () => {}]])
    const s = new Set<any>([1, () => {}])
    const outM = cloneSafe(m) as Map<any, any>
    const outS = cloneSafe(s) as Set<any>
    expect(outM).toBeInstanceOf(Map)
    expect(outM.get('k')).toBe(1)
    expect(outM.get('fn')).toMatch(/^\[Function: /)
    expect(outS).toBeInstanceOf(Set)
    expect([...outS][0]).toBe(1)
    expect([...outS][1]).toMatch(/^\[Function: /)
    expectCloneable(outM)
    expectCloneable(outS)
  })

  it('passes through Date / RegExp / TypedArray', () => {
    const d = new Date(0)
    const re = /abc/g
    const ta = new Uint8Array([1, 2, 3])
    expect(cloneSafe(d)).toBe(d)
    expect(cloneSafe(re)).toBe(re)
    expect(cloneSafe(ta)).toBe(ta)
    expectCloneable(cloneSafe({ d, re, ta }))
  })
})

describe('cloneSafe — circular and deep', () => {
  it('replaces circular references with a marker', () => {
    const a: any = { name: 'a' }
    a.self = a
    const out = cloneSafe(a) as any
    expect(out.name).toBe('a')
    expect(out.self).toBe('[Circular]')
    expectCloneable(out)
  })

  it('survives a deeply nested structure (depth cap)', () => {
    let deep: any = {}
    let cur = deep
    for (let i = 0; i < 200; i++) {
      cur.next = {}
      cur = cur.next
    }
    const out = cloneSafe(deep)
    expectCloneable(out)
  })
})

describe('cloneSafe — reproduces the original worker crash', () => {
  // This is the exact shape that threw DataCloneError in emitState: a flow context
  // carrying an enumerable AbortSignal (`_signal`) plus a capture trace whose
  // nodes recorded function/proxy outputs. Before the fix, structuredClone of this
  // threw; after cloneSafe it must not.
  it('a context with _signal + script output + proxy env is cloneable', () => {
    const ac = new AbortController()
    const vaultProxy = new Proxy({}, { get() { throw new Error('lazy secret') } })

    const context: any = {
      trigger: { type: 'chat_message', message: 'hi' },
      _signal: ac.signal, // AbortSignal — enumerable, always present
      environment: vaultProxy, // vault accessor Proxy
      node_script_1: {
        // a script node that returned a function (real RCE-allowed output)
        handler: () => 'gotcha',
        nested: { cb: function namedCb() {} },
      },
      loop: { item: 'x', index: 0 },
    }

    // The capture delta the worker tries to emit.
    const delta = {
      'capture:server-1': {
        active: true,
        flowId: 'flow_1780789996048',
        trace: [
          { nodeId: 'n1', output: { fn: () => {}, ok: true } },
          { nodeId: 'n2', output: { signal: ac.signal } },
        ],
        context,
      },
    }

    // Raw delta would throw; the sanitized one must not.
    expect(() => structuredClone(delta)).toThrow()
    const safe = cloneSafe(delta)
    expect(() => structuredClone(safe)).not.toThrow()

    // And the useful data is still there for the panel preview.
    const cap = (safe as any)['capture:server-1']
    expect(cap.active).toBe(true)
    expect(cap.flowId).toBe('flow_1780789996048')
    expect(cap.context.trigger.message).toBe('hi')
    expect(cap.context._signal).toBe('[AbortSignal]')
    expect(cap.context.node_script_1.handler).toMatch(/^\[Function: /)
    expect(cap.trace[0].output.ok).toBe(true)
    expect(cap.trace[0].output.fn).toMatch(/^\[Function: /)
  })
})
