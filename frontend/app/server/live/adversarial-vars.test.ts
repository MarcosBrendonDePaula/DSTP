// ADVERSARIAL unit tests for the variable/loop nodes. These deliberately try to
// BREAK the handlers (prototype pollution, NaN/Infinity coercion, circular
// structures, runaway loops, break-flag leakage). Each test asserts the SAFE
// expected behavior — a FAILING test here means a real bug was found, and is
// flagged with a `// BUG:` comment. Driven through the testkit (mock
// NodeRunContext) so no FlowEngine / db is involved.
//
// Run: cd frontend && bun test app/server/live/adversarial-vars.test.ts
import { describe, it, expect, afterEach } from 'bun:test'
import { makeRc } from './nodes/testkit'
import { resolveValue } from './expressions'
import { handler as editVar } from '@shared/automation/nodes/data/vars/edit_variable/exec'
import { handler as aggregate } from '@shared/automation/nodes/data/vars/aggregate/exec'
import { handler as loop } from '@shared/automation/nodes/logic/loop/loop/exec'
import { handler as brk } from '@shared/automation/nodes/logic/loop/break/exec'

// Defensive cleanup: if a test DOES manage to pollute Object.prototype, scrub it
// so the pollution doesn't cascade into unrelated tests (the test still fails,
// but we don't poison the whole suite).
afterEach(() => {
  for (const k of ['polluted', 'isAdmin', 'injected', 'x', 'evil']) {
    // @ts-ignore
    delete (Object.prototype as any)[k]
  }
})

// ───────────────────────── 1. Prototype pollution ─────────────────────────

describe('edit_variable — prototype pollution', () => {
  it('set key="__proto__" must NOT pollute Object.prototype', async () => {
    const ctx: any = { vars: {} }
    await editVar(makeRc({
      data: { params: { operation: 'set', key: '__proto__', value: { polluted: 'yes' } } },
      context: ctx,
    }).rc)
    // The danger: a fresh object inheriting `polluted` from Object.prototype.
    expect(({} as any).polluted).toBeUndefined()
  })

  it('set key="constructor" must NOT corrupt the constructor chain', async () => {
    const ctx: any = { vars: {} }
    await editVar(makeRc({
      data: { params: { operation: 'set', key: 'constructor', value: { prototype: { polluted: 'yes' } } } },
      context: ctx,
    }).rc)
    expect(({} as any).polluted).toBeUndefined()
  })

  it('append to key="__proto__" must NOT pollute Object.prototype', async () => {
    const ctx: any = { vars: {} }
    // First call: vars.__proto__ is the (object) prototype, not null and not an
    // array and not a string → handler does vars[key] = [vars[key], raw], i.e.
    // reassigns vars's prototype to an array. Observe whether anything leaks.
    await editVar(makeRc({
      data: { params: { operation: 'append', key: '__proto__', value: 'evil' } },
      context: ctx,
    }).rc)
    expect(({} as any).polluted).toBeUndefined()
    expect(Array.isArray(({} as any))).toBe(false)
  })

  it('inc on key="__proto__" does not throw / leak', async () => {
    const ctx: any = { vars: {} }
    await editVar(makeRc({
      data: { params: { operation: 'inc', key: '__proto__', value: '1' } },
      context: ctx,
    }).rc)
    expect(({} as any).__proto__no_such).toBeUndefined()
  })

  // The vault stores resolved secrets, and {{vars.x}} reads from context.vars. If
  // an attacker can set vars.__proto__.admin, a later {{vars.admin}} lookup on a
  // DIFFERENT (empty) vars object could inherit it. This is the real-world impact.
  it('after a __proto__ set, {{vars.admin}} on a fresh context must NOT resolve', async () => {
    const ctx: any = { vars: {} }
    await editVar(makeRc({
      data: { params: { operation: 'set', key: '__proto__', value: { isAdmin: true } } },
      context: ctx,
    }).rc)
    const fresh: any = { vars: {} }
    // If Object.prototype was polluted, {{vars.isAdmin}} would resolve to "true".
    expect(resolveValue('{{vars.isAdmin}}', fresh)).toBe('{{vars.isAdmin}}')
  })
})

// ───────────────────── 2. key with a dotted path ──────────────────────────

describe('edit_variable — dotted-path key', () => {
  it('key="a.b.c" is a LITERAL key (no deep navigation)', async () => {
    const ctx: any = { vars: {} }
    await editVar(makeRc({
      data: { params: { operation: 'set', key: 'a.b.c', value: 'deep' } },
      context: ctx,
    }).rc)
    // Documents actual behavior: it's a flat literal key.
    expect(ctx.vars['a.b.c']).toBe('deep')
    expect(ctx.vars.a).toBeUndefined()
  })

  it('a literal dotted key is NOT readable via {{vars.a.b.c}} (path mismatch)', async () => {
    const ctx: any = { vars: { 'a.b.c': 'deep' } }
    // resolveValue splits on '.', so it looks for vars.a.b.c (nested) and misses
    // the flat "a.b.c" key. This means a dotted key written by edit_variable is
    // effectively UNREADABLE by the templating system — a usability footgun.
    expect(resolveValue('{{vars.a.b.c}}', ctx)).toBe('{{vars.a.b.c}}')
  })
})

// ───────────────── 3. inc/dec on absurd values ────────────────────────────

describe('edit_variable — inc/dec coercion', () => {
  it('inc on a non-numeric string starts from 0', async () => {
    const ctx: any = { vars: { n: 'abc' } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: '1' } }, context: ctx }).rc)
    expect(ctx.vars.n).toBe(1) // Number('abc')||0 = 0, +1
  })

  it('inc by a non-numeric amount adds 0 (no NaN)', async () => {
    const ctx: any = { vars: { n: 10 } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: 'xyz' } }, context: ctx }).rc)
    // Number('xyz')||0 = 0 → stays 10. No NaN should leak.
    expect(ctx.vars.n).toBe(10)
    expect(Number.isNaN(ctx.vars.n)).toBe(false)
  })

  it('inc on Infinity stays Infinity (does not crash)', async () => {
    const ctx: any = { vars: { n: Infinity } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: '1' } }, context: ctx }).rc)
    // Number(Infinity)||0 = Infinity. Documents the behavior.
    expect(ctx.vars.n).toBe(Infinity)
  })

  it('inc with value "Infinity" coerces to Infinity', async () => {
    const ctx: any = { vars: { n: 0 } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: 'Infinity' } }, context: ctx }).rc)
    expect(ctx.vars.n).toBe(Infinity)
  })

  it('inc on an object value resets to 0-based (Number(obj)=NaN → 0)', async () => {
    const ctx: any = { vars: { n: { a: 1 } } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: '5' } }, context: ctx }).rc)
    expect(ctx.vars.n).toBe(5)
  })

  it('inc on an array value: Number([])=0, Number([3])=3', async () => {
    const ctx: any = { vars: { a: [], b: [3] } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'a', value: '1' } }, context: ctx }).rc)
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'b', value: '1' } }, context: ctx }).rc)
    expect(ctx.vars.a).toBe(1)
    expect(ctx.vars.b).toBe(4) // Number([3]) === 3
  })

  it('inc with a huge numeric string that overflows to Infinity', async () => {
    const ctx: any = { vars: { n: 0 } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: '1e400' } }, context: ctx }).rc)
    // 1e400 parses to Infinity in JS. Number('1e400')||0 = Infinity.
    expect(ctx.vars.n).toBe(Infinity)
  })

  it('inc on null value treats as 0', async () => {
    const ctx: any = { vars: { n: null } }
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: '3' } }, context: ctx }).rc)
    expect(ctx.vars.n).toBe(3)
  })
})

// ───────────────────── 4. append edge cases ───────────────────────────────

describe('edit_variable — append', () => {
  it('append to a number wraps both into an array', async () => {
    const ctx: any = { vars: { n: 5 } }
    await editVar(makeRc({ data: { params: { operation: 'append', key: 'n', value: 'x' } }, context: ctx }).rc)
    expect(ctx.vars.n).toEqual([5, 'x'])
  })

  it('append to a boolean wraps both into an array', async () => {
    const ctx: any = { vars: { b: true } }
    await editVar(makeRc({ data: { params: { operation: 'append', key: 'b', value: 'x' } }, context: ctx }).rc)
    expect(ctx.vars.b).toEqual([true, 'x'])
  })

  it('append an object to an array stores it by reference (circular safe)', async () => {
    const ctx: any = { vars: { xs: [] } }
    const circular: any = { name: 'loop' }
    circular.self = circular
    // The handler just .push()es — no JSON serialization — so a circular object
    // must not crash here.
    await editVar(makeRc({ data: { params: { operation: 'append', key: 'xs', value: circular } }, context: ctx }).rc)
    expect(ctx.vars.xs[0]).toBe(circular)
    expect(ctx.vars.xs[0].self).toBe(circular)
  })

  it('appending the array to itself does not infinite-loop on push', async () => {
    const ctx: any = { vars: { xs: ['a'] } }
    const arr = ctx.vars.xs
    // value resolves to the same array reference (raw passthrough).
    await editVar(makeRc({ data: { params: { operation: 'append', key: 'xs', value: arr } }, context: ctx }).rc)
    // push stores the array as its own last element — self reference, no crash.
    expect(ctx.vars.xs.length).toBe(2)
    expect(ctx.vars.xs[1]).toBe(arr)
  })

  it('append thousands of times grows the array linearly (no quadratic blowup / crash)', async () => {
    const ctx: any = { vars: {} }
    for (let k = 0; k < 5000; k++) {
      await editVar(makeRc({ data: { params: { operation: 'append', key: 'big', value: k } }, context: ctx }).rc)
    }
    expect(ctx.vars.big.length).toBe(5000)
    expect(ctx.vars.big[4999]).toBe(4999)
  })
})

// ───────────────────────── 5. aggregate ───────────────────────────────────

describe('aggregate — adversarial', () => {
  it('empty key falls back to the default "items" key', async () => {
    const ctx: any = { vars: {} }
    const spy = makeRc({ data: { params: { operation: 'push', key: '', value: 'v' } }, context: ctx })
    await aggregate(spy.rc)
    expect(ctx.vars.items).toEqual(['v'])
  })

  it('whitespace-only key falls back to "items" (trimmed)', async () => {
    const ctx: any = { vars: {} }
    await aggregate(makeRc({ data: { params: { operation: 'push', key: '   ', value: 'v' } }, context: ctx }).rc)
    expect(ctx.vars.items).toEqual(['v'])
  })

  it('reset on a non-existent key creates an empty array (no crash)', async () => {
    const ctx: any = { vars: {} }
    const spy = makeRc({ data: { params: { operation: 'reset', key: 'nope' } }, context: ctx })
    await aggregate(spy.rc)
    expect(ctx.vars.nope).toEqual([])
    expect(spy.out().count).toBe(0)
  })

  it('push undefined stores undefined as a real element', async () => {
    const ctx: any = { vars: {} }
    // No value param at all → rc.param('value') is undefined → push(undefined).
    await aggregate(makeRc({ data: { params: { operation: 'push', key: 'u' } }, context: ctx }).rc)
    expect(ctx.vars.u.length).toBe(1)
    expect(ctx.vars.u[0]).toBeUndefined()
  })

  it('wrapping a pre-existing scalar does NOT lose the scalar', async () => {
    const ctx: any = { vars: { out: 42 } }
    await aggregate(makeRc({ data: { params: { operation: 'push', key: 'out', value: 'next' } }, context: ctx }).rc)
    expect(ctx.vars.out).toEqual([42, 'next'])
  })

  it('wrapping a pre-existing FALSY scalar (0) does NOT lose it', async () => {
    const ctx: any = { vars: { out: 0 } }
    // 0 != null so it should be wrapped as [0], not treated as empty.
    await aggregate(makeRc({ data: { params: { operation: 'push', key: 'out', value: 'x' } }, context: ctx }).rc)
    expect(ctx.vars.out).toEqual([0, 'x'])
  })

  it('wrapping a pre-existing empty-string scalar does NOT lose it', async () => {
    const ctx: any = { vars: { out: '' } }
    await aggregate(makeRc({ data: { params: { operation: 'push', key: 'out', value: 'x' } }, context: ctx }).rc)
    // '' != null → wrapped as ['', 'x'].
    expect(ctx.vars.out).toEqual(['', 'x'])
  })

  it('aggregate key="__proto__" must NOT pollute Object.prototype', async () => {
    const ctx: any = { vars: {} }
    await aggregate(makeRc({ data: { params: { operation: 'push', key: '__proto__', value: 'evil' } }, context: ctx }).rc)
    expect(({} as any).polluted).toBeUndefined()
    expect(([] as any).evil).toBeUndefined()
  })
})

// ───────────────────────── 6. loop ────────────────────────────────────────

// Helper: a loop whose condition is driven by a counter in vars, mutated by an
// override of followOutEdges that simulates the body running edit_variable.
function loopRc(opts: {
  mode?: string
  field?: string
  operator?: string
  value?: string
  context: any
  edges?: any[]
  onBody?: () => void
  bodyReturnsWait?: boolean
}) {
  let resetCalls = 0
  const spy = makeRc({
    data: { params: { mode: opts.mode ?? 'while' }, field: opts.field, operator: opts.operator, value: opts.value },
    context: opts.context,
    edges: opts.edges ?? [],
    overrides: {
      followOutEdges: async (filter?: any) => {
        // Only the 'body' handle should be followed during iteration.
        if (filter?.({ sourceHandle: 'body' } as any)) {
          opts.onBody?.()
          if (opts.bodyReturnsWait) return { id: 'waitnode' } as any
        }
        return null
      },
      resetVisits: () => { resetCalls++ },
    },
  })
  return { spy, resetCalls: () => resetCalls }
}

describe('loop — adversarial', () => {
  it('an always-true condition is bounded by the 200 cap (no infinite loop)', async () => {
    const ctx: any = { vars: { n: 0 } }
    let bodyRuns = 0
    // condition: {{vars.n}} > -1 is always true, but body never changes n.
    const { spy } = loopRc({
      field: '{{vars.n}}', operator: 'greater_than', value: '-1',
      context: ctx,
      onBody: () => { bodyRuns++ },
    })
    await loop(spy.rc)
    expect(bodyRuns).toBe(200)
    expect(spy.out().stoppedBy).toBe('cap')
    expect(spy.out().iterations).toBe(200)
  })

  it('loop with NO body edges still runs the iterations (200x of nothing) and hits the cap', async () => {
    // bodyIds is empty (no edges). followOutEdges('body') matches nothing → null.
    // The loop still spins 200 times evaluating the always-true condition.
    const ctx: any = { vars: {} }
    const spy = makeRc({
      data: { params: { mode: 'while' } },
      context: ctx,
      edges: [],
    })
    const out: any = await loop(spy.rc)
    expect(spy.out().stoppedBy).toBe('cap')
    expect(spy.out().iterations).toBe(200)
    // It returns a followEdges filter for the 'done' handle.
    expect(out.followEdges({ sourceHandle: 'done' })).toBe(true)
  })

  it('an invalid mode is treated as "while" (cond===true to continue)', async () => {
    const ctx: any = { vars: {} }
    // mode "banana": shouldContinue = cond (the while branch). field/operator
    // missing → evaluateCondition returns true → runs to cap.
    let runs = 0
    const { spy } = loopRc({ mode: 'banana', context: ctx, onBody: () => { runs++ } })
    await loop(spy.rc)
    expect(runs).toBe(200)
    expect(spy.out().stoppedBy).toBe('cap')
  })

  it('until-mode stops as soon as the condition becomes true', async () => {
    const ctx: any = { vars: { n: 0 } }
    // until {{vars.n}} >= 3: body increments n each pass.
    const { spy } = loopRc({
      mode: 'until', field: '{{vars.n}}', operator: 'greater_than', value: '2',
      context: ctx,
      onBody: () => { ctx.vars.n++ },
    })
    await loop(spy.rc)
    // n: check0(false,run→1) check1(false,run→2) check2(false,run→3) check3(true→stop)
    expect(ctx.vars.n).toBe(3)
    expect(spy.out().stoppedBy).toBe('condition')
  })

  it('break flag set during the body stops the loop and is consumed', async () => {
    const ctx: any = { vars: {} }
    const { spy } = loopRc({
      // no field/operator → evaluateCondition returns true (always-continue)
      context: ctx,
      onBody: () => { (ctx as any)._break = true },
    })
    await loop(spy.rc)
    expect(spy.out().stoppedBy).toBe('break')
    expect(spy.out().iterations).toBe(1)
    // _break must be cleared after consumption.
    expect((ctx as any)._break).toBeUndefined()
  })

  it('a stale _break left in context before the loop is cleared and does NOT pre-break', async () => {
    const ctx: any = { vars: { n: 0 }, _break: true }
    let runs = 0
    const { spy } = loopRc({
      mode: 'until', field: '{{vars.n}}', operator: 'greater_than', value: '1',
      context: ctx,
      onBody: () => { runs++; ctx.vars.n++ },
    })
    await loop(spy.rc)
    // The loop clears the inherited _break at start, so it should run normally
    // (until n>1: runs twice) rather than break on iteration 1.
    expect(runs).toBe(2)
    expect(spy.out().stoppedBy).toBe('condition')
  })

  it('a wait node inside the body surfaces { wait } and restores the loop context', async () => {
    const ctx: any = { loop: { index: 99, item: 'outer' }, vars: {} }
    const { spy } = loopRc({
      // no field/operator → always-true condition
      context: ctx,
      bodyReturnsWait: true,
    })
    const out: any = await loop(spy.rc)
    expect(out.wait).toBeTruthy()
    // The enclosing loop context must be restored after the wait bubbles up.
    expect(ctx.loop).toEqual({ index: 99, item: 'outer' })
  })

  it('resetVisits is called once per completed pass (re-arming the body)', async () => {
    const ctx: any = { vars: { n: 0 } }
    const { spy, resetCalls } = loopRc({
      mode: 'until', field: '{{vars.n}}', operator: 'greater_than', value: '2',
      context: ctx,
      onBody: () => { ctx.vars.n++ },
    })
    await loop(spy.rc)
    // 3 passes run; resetVisits is called after each pass that did NOT break/wait.
    expect(resetCalls()).toBe(3)
  })

  it('nested loop context is restored for the outer loop after inner completes', async () => {
    const ctx: any = { loop: { index: 7, iteration: 8, item: 'X' }, vars: {} }
    // Inner loop with condition immediately false (mode while, cond false).
    const spy = makeRc({
      data: { params: { mode: 'while' }, field: '{{vars.n}}', operator: 'greater_than', value: '0' },
      context: ctx,
    })
    // vars.n is undefined → Number(undefined) > 0 is false → loop body never runs.
    await loop(spy.rc)
    expect(ctx.loop).toEqual({ index: 7, iteration: 8, item: 'X' })
  })
})

// ───────────────── 7. break leakage across loops ──────────────────────────

describe('break — leakage', () => {
  it('a break OUTSIDE any loop sets _break, which the NEXT loop must clear', async () => {
    const ctx: any = { vars: {} }
    // Fire an unconditional break with no surrounding loop.
    await brk(makeRc({ data: { params: {} }, context: ctx }).rc)
    expect((ctx as any)._break).toBe(true)
    // Now a loop runs; it must clear the inherited flag and NOT instantly break.
    let runs = 0
    const { spy } = loopRc({
      mode: 'until', field: '{{vars.n}}', operator: 'greater_than', value: '2',
      context: ctx,
      onBody: () => { runs++; ctx.vars.n = runs },
    })
    await loop(spy.rc)
    // until vars.n > 2 → runs 3 times (n:0→1→2→3). If _break leaked, runs would be 1.
    expect(runs).toBe(3)
    expect(spy.out().stoppedBy).toBe('condition')
  })

  it('conditional break with a true condition fires and stops', async () => {
    const ctx: any = { vars: { n: 10 } }
    const spy = makeRc({
      data: { params: { conditional: true }, field: '{{vars.n}}', operator: 'greater_than', value: '5' },
      context: ctx,
    })
    const result = await brk(spy.rc)
    expect((ctx as any)._break).toBe(true)
    expect(result).toBe('stop')
  })

  it('conditional break accepts the string "true" for the conditional flag', async () => {
    const ctx: any = { vars: { n: 1 } }
    // conditional="true" (string) and a false condition → must NOT break.
    const spy = makeRc({
      data: { params: { conditional: 'true' }, field: '{{vars.n}}', operator: 'greater_than', value: '5' },
      context: ctx,
    })
    const result = await brk(spy.rc)
    expect((ctx as any)._break).toBeUndefined()
    expect(result).toBe('continue')
  })
})
