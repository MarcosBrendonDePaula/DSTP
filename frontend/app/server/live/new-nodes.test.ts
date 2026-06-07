// Unit tests for the data/logic primitives added in the post-#26 node rounds,
// driven through the testkit (a mock NodeRunContext) so each handler is exercised
// in isolation — no FlowEngine, no db. The loop/break/edit_variable end-to-end
// behavior is covered in FlowEngine.e2e.test.ts; here we pin the per-handler
// contracts and the branches the e2e can't easily force (try_catch on a throwing
// inner branch).
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { makeRc } from './nodes/testkit'
import { handler as editVar } from '@shared/automation/nodes/data/vars/edit_variable/exec'
import { handler as aggregate } from '@shared/automation/nodes/data/vars/aggregate/exec'
import { handler as datetime } from '@shared/automation/nodes/data/transform/datetime/exec'
import { handler as tryCatch } from '@shared/automation/nodes/logic/branch/try_catch/exec'
import { handler as brk } from '@shared/automation/nodes/logic/loop/break/exec'

describe('edit_variable', () => {
  it('set then inc/dec mutate context.vars', async () => {
    const ctx: any = { vars: {} }
    await editVar(makeRc({ data: { params: { operation: 'set', key: 'n', value: '10' } }, context: ctx }).rc)
    expect(ctx.vars.n).toBe('10')
    await editVar(makeRc({ data: { params: { operation: 'inc', key: 'n', value: '5' } }, context: ctx }).rc)
    expect(ctx.vars.n).toBe(15) // numeric after inc
    await editVar(makeRc({ data: { params: { operation: 'dec', key: 'n' } }, context: ctx }).rc)
    expect(ctx.vars.n).toBe(14) // default amount 1
  })

  it('append builds an array; toggle flips; delete removes', async () => {
    const ctx: any = { vars: {} }
    await editVar(makeRc({ data: { params: { operation: 'append', key: 'xs', value: 'a' } }, context: ctx }).rc)
    await editVar(makeRc({ data: { params: { operation: 'append', key: 'xs', value: 'b' } }, context: ctx }).rc)
    expect(ctx.vars.xs).toEqual(['a', 'b'])
    await editVar(makeRc({ data: { params: { operation: 'toggle', key: 'flag' } }, context: ctx }).rc)
    expect(ctx.vars.flag).toBe(true)
    await editVar(makeRc({ data: { params: { operation: 'delete', key: 'xs' } }, context: ctx }).rc)
    expect('xs' in ctx.vars).toBe(false)
  })

  it('seeds context.vars if missing, and no-ops without a key', async () => {
    const ctx: any = {}
    const spy = makeRc({ data: { params: { operation: 'set', key: '', value: 'x' } }, context: ctx })
    await editVar(spy.rc)
    expect(ctx.vars).toEqual({})
    expect(spy.out().error).toMatch(/no key/)
  })
})

describe('aggregate', () => {
  it('push accumulates across calls (sharing context.vars like a loop does)', async () => {
    const ctx: any = { vars: {} }
    for (const v of ['x', 'y', 'z']) {
      await aggregate(makeRc({ data: { params: { operation: 'push', key: 'out', value: v } }, context: ctx }).rc)
    }
    expect(ctx.vars.out).toEqual(['x', 'y', 'z'])
    const spy = makeRc({ data: { params: { operation: 'push', key: 'out', value: 'w' } }, context: ctx })
    await aggregate(spy.rc)
    expect(spy.out()).toEqual({ array: ['x', 'y', 'z', 'w'], count: 4 })
  })

  it('reset empties the array', async () => {
    const ctx: any = { vars: { out: ['a', 'b'] } }
    const spy = makeRc({ data: { params: { operation: 'reset', key: 'out' } }, context: ctx })
    await aggregate(spy.rc)
    expect(ctx.vars.out).toEqual([])
    expect(spy.out().count).toBe(0)
  })

  it('wraps a pre-existing non-array value instead of losing it', async () => {
    const ctx: any = { vars: { out: 'seed' } }
    await aggregate(makeRc({ data: { params: { operation: 'push', key: 'out', value: 'next' } }, context: ctx }).rc)
    expect(ctx.vars.out).toEqual(['seed', 'next'])
  })
})

describe('datetime', () => {
  it('now returns ms + iso', async () => {
    const spy = makeRc({ data: { params: { operation: 'now' } } })
    await datetime(spy.rc)
    const o = spy.out()
    expect(typeof o.ms).toBe('number')
    expect(o.iso).toBe(new Date(o.ms).toISOString())
    expect(o.value).toBe(o.ms)
  })

  it('add adds an amount of a unit to a timestamp', async () => {
    const base = 1_000_000
    const spy = makeRc({ data: { params: { operation: 'add', value: String(base), amount: '2', unit: 'minutes' } } })
    await datetime(spy.rc)
    expect(spy.out().ms).toBe(base + 2 * 60_000)
  })

  it('add accepts negative amounts (subtract)', async () => {
    const spy = makeRc({ data: { params: { operation: 'add', value: '100000', amount: '-10', unit: 'seconds' } } })
    await datetime(spy.rc)
    expect(spy.out().ms).toBe(100000 - 10_000)
  })

  it('diff returns the difference in the chosen unit', async () => {
    const spy = makeRc({ data: { params: { operation: 'diff', value: '0', value2: String(3 * 3_600_000), unit: 'hours' } } })
    await datetime(spy.rc)
    expect(spy.out().value).toBe(3)
  })

  it('format turns a timestamp into its ISO string', async () => {
    const spy = makeRc({ data: { params: { operation: 'format', value: '0' } } })
    await datetime(spy.rc)
    expect(spy.out().value).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('try_catch', () => {
  it('on success runs the try branch and stops (does not double-follow)', async () => {
    let triedHandle: string | undefined
    const spy = makeRc({
      data: {},
      overrides: {
        followOutEdges: async (filter?: any) => {
          // simulate the dispatcher: record which handle the node asked to follow
          triedHandle = ['try', 'catch'].find(h => filter?.({ sourceHandle: h } as any))
          return null // try branch ran fine
        },
      },
    })
    const result = await tryCatch(spy.rc)
    expect(triedHandle).toBe('try')
    expect(spy.out()).toEqual({ ok: true, error: '' })
    expect(result).toBe('stop')
  })

  it('on a throwing try branch, catches and follows ONLY the catch handle', async () => {
    const spy = makeRc({
      data: {},
      overrides: {
        followOutEdges: async (filter?: any) => {
          // the try branch threw (a node inside it failed)
          if (filter?.({ sourceHandle: 'try' } as any)) throw new Error('boom in http')
          return null
        },
      },
    })
    const result: any = await tryCatch(spy.rc)
    expect(spy.out()).toEqual({ ok: false, error: 'boom in http' })
    // result is a followEdges filter that matches catch, not try
    expect(typeof result).toBe('object')
    expect(result.followEdges({ sourceHandle: 'catch' })).toBe(true)
    expect(result.followEdges({ sourceHandle: 'try' })).toBe(false)
  })
})

describe('break', () => {
  it('unconditional break signals context._break and stops', async () => {
    const ctx: any = {}
    const spy = makeRc({ data: { params: {} }, context: ctx })
    const result = await brk(spy.rc)
    expect(ctx._break).toBe(true)
    expect(spy.out().broke).toBe(true)
    expect(result).toBe('stop')
  })

  it('conditional break does NOT fire (and continues) when the condition is false', async () => {
    const ctx: any = { vars: { n: 1 } }
    const spy = makeRc({
      data: { params: { conditional: true }, field: '{{vars.n}}', operator: 'greater_than', value: '5' },
      context: ctx,
    })
    const result = await brk(spy.rc)
    expect(ctx._break).toBeUndefined()
    expect(spy.out().broke).toBe(false)
    expect(result).toBe('continue')
  })
})
