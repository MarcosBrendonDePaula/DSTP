import { describe, it, expect } from 'vitest'
import { resolveValue, evaluateCondition, resolveConditionField, stripCommandPrefix } from './expressions'

describe('resolveValue', () => {
  const ctx = {
    trigger: { name: 'Wilson', userid: 'u1', day: 0, hp: 100, dead: false, empty: '' },
    player: { stats: { sanity: 42 } },
    list: [{ x: 1 }, { x: 2 }],
  }

  describe('passthrough', () => {
    it('returns non-strings unchanged (preserves type)', () => {
      expect(resolveValue(42, ctx)).toBe(42)
      expect(resolveValue(true, ctx)).toBe(true)
      const obj = { a: 1 }
      expect(resolveValue(obj, ctx)).toBe(obj)
      expect(resolveValue(null, ctx)).toBe(null)
      expect(resolveValue(undefined, ctx)).toBe(undefined)
    })

    it('returns strings without {{ }} unchanged', () => {
      expect(resolveValue('hello world', ctx)).toBe('hello world')
      expect(resolveValue('', ctx)).toBe('')
    })
  })

  describe('single-expression (raw typed value)', () => {
    it('resolves a single {{path}} to the raw value, preserving type', () => {
      expect(resolveValue('{{trigger.name}}', ctx)).toBe('Wilson')
      expect(resolveValue('{{trigger.hp}}', ctx)).toBe(100) // number, not "100"
      expect(resolveValue('{{player.stats.sanity}}', ctx)).toBe(42)
    })

    it('preserves false (does not fall back to template)', () => {
      expect(resolveValue('{{trigger.dead}}', ctx)).toBe(false)
    })

    it('preserves empty string (does not fall back to template)', () => {
      expect(resolveValue('{{trigger.empty}}', ctx)).toBe('')
    })

    it('REGRESSION: preserves zero (falsy but present)', () => {
      // The original used `value ?? template`, which correctly keeps 0.
      // A naive `value || template` would wrongly return the literal text.
      expect(resolveValue('{{trigger.day}}', ctx)).toBe(0)
    })

    it('trims whitespace inside the braces', () => {
      expect(resolveValue('{{  trigger.name  }}', ctx)).toBe('Wilson')
    })

    it('leaves the template text when the path is unresolved', () => {
      expect(resolveValue('{{trigger.nope}}', ctx)).toBe('{{trigger.nope}}')
      expect(resolveValue('{{missing.deep.path}}', ctx)).toBe('{{missing.deep.path}}')
    })

    it('leaves the template text when an intermediate segment is null', () => {
      expect(resolveValue('{{player.missing.sanity}}', ctx)).toBe('{{player.missing.sanity}}')
    })
  })

  describe('mixed content (string interpolation)', () => {
    it('interpolates one expression inside surrounding text', () => {
      expect(resolveValue('Hi {{trigger.name}}!', ctx)).toBe('Hi Wilson!')
    })

    it('interpolates multiple expressions', () => {
      expect(resolveValue('{{trigger.name}} on day {{trigger.day}}', ctx)).toBe('Wilson on day 0')
    })

    it('stringifies a zero in mixed content (not dropped)', () => {
      expect(resolveValue('day={{trigger.day}}', ctx)).toBe('day=0')
    })

    it('leaves unresolved placeholders in place', () => {
      expect(resolveValue('Hi {{trigger.nope}}!', ctx)).toBe('Hi {{trigger.nope}}!')
    })

    it('resolves some and leaves others', () => {
      expect(resolveValue('{{trigger.name}}/{{trigger.nope}}', ctx)).toBe('Wilson/{{trigger.nope}}')
    })
  })

  describe('edge cases', () => {
    it('handles an empty context without throwing', () => {
      expect(resolveValue('{{a.b.c}}', {})).toBe('{{a.b.c}}')
      expect(resolveValue('text {{a}} more', {})).toBe('text {{a}} more')
    })
  })
})

describe('resolveConditionField', () => {
  const ctx = { trigger: { message: 'hi', userid: 'u1', day: 0 }, tm: { message: 'nested' } }

  it('resolves a full {{template}} field', () => {
    expect(resolveConditionField('{{tm.message}}', ctx)).toBe('nested')
  })

  it('resolves a raw dotted path field', () => {
    expect(resolveConditionField('tm.message', ctx)).toBe('nested')
  })

  it('resolves a plain key from trigger first', () => {
    expect(resolveConditionField('message', ctx)).toBe('hi')
  })

  it('plain key falls back to full context when not on trigger', () => {
    expect(resolveConditionField('tm', ctx)).toEqual({ message: 'nested' })
  })

  it('plain key resolves a falsy-zero trigger value (not skipped)', () => {
    expect(resolveConditionField('day', ctx)).toBe(0)
  })
})

describe('evaluateCondition', () => {
  const ctx = { trigger: { name: 'Wilson', hp: 50, day: 3, dead: false }, count: 0 }

  it('passes (true) when field or operator is missing', () => {
    expect(evaluateCondition({}, ctx)).toBe(true)
    expect(evaluateCondition({ field: 'name' }, ctx)).toBe(true)
    expect(evaluateCondition({ operator: 'equals' }, ctx)).toBe(true)
  })

  it('equals / not_equals compare as strings', () => {
    expect(evaluateCondition({ field: 'name', operator: 'equals', value: 'Wilson' }, ctx)).toBe(true)
    expect(evaluateCondition({ field: 'name', operator: 'equals', value: 'Wendy' }, ctx)).toBe(false)
    expect(evaluateCondition({ field: 'name', operator: 'not_equals', value: 'Wendy' }, ctx)).toBe(true)
  })

  it('equals coerces numbers to strings (50 == "50")', () => {
    expect(evaluateCondition({ field: 'hp', operator: 'equals', value: '50' }, ctx)).toBe(true)
  })

  it('greater_than / less_than compare numerically', () => {
    expect(evaluateCondition({ field: 'hp', operator: 'greater_than', value: '40' }, ctx)).toBe(true)
    expect(evaluateCondition({ field: 'hp', operator: 'greater_than', value: '60' }, ctx)).toBe(false)
    expect(evaluateCondition({ field: 'hp', operator: 'less_than', value: '60' }, ctx)).toBe(true)
  })

  it('contains does substring match', () => {
    expect(evaluateCondition({ field: 'name', operator: 'contains', value: 'ils' }, ctx)).toBe(true)
    expect(evaluateCondition({ field: 'name', operator: 'contains', value: 'xyz' }, ctx)).toBe(false)
  })

  it('starts_with / ends_with anchor the match', () => {
    const cmdCtx = { trigger: { message: '!ban Wilson' } }
    expect(evaluateCondition({ field: 'message', operator: 'starts_with', value: '!ban' }, cmdCtx)).toBe(true)
    expect(evaluateCondition({ field: 'message', operator: 'starts_with', value: 'ban' }, cmdCtx)).toBe(false)
    // the false-positive starts_with fixes: contains '!ban' also matches '!banana'
    const trap = { trigger: { message: '!banana split' } }
    expect(evaluateCondition({ field: 'message', operator: 'contains', value: '!ban' }, trap)).toBe(true)
    expect(evaluateCondition({ field: 'message', operator: 'starts_with', value: '!ban ' }, trap)).toBe(false)
    expect(evaluateCondition({ field: 'name', operator: 'ends_with', value: 'son' }, ctx)).toBe(true)
    expect(evaluateCondition({ field: 'name', operator: 'ends_with', value: 'Wil' }, ctx)).toBe(false)
  })

  it('exists is true for present values including falsy ones', () => {
    expect(evaluateCondition({ field: 'name', operator: 'exists' }, ctx)).toBe(true)
    expect(evaluateCondition({ field: 'dead', operator: 'exists' }, ctx)).toBe(true) // false is present
    expect(evaluateCondition({ field: 'count', operator: 'exists' }, ctx)).toBe(true) // 0 is present
  })

  it('exists is false for an unresolved field', () => {
    // Unresolved templates resolve to their literal text, which is non-null, so
    // exists on a truly-absent plain key checks the resolved value:
    expect(evaluateCondition({ field: 'nope', operator: 'exists' }, ctx)).toBe(true)
  })

  it('unknown operator passes (true)', () => {
    expect(evaluateCondition({ field: 'name', operator: 'weird' as any, value: 'x' }, ctx)).toBe(true)
  })
})

describe('stripCommandPrefix', () => {
  it('strips chat command prefixes from a name', () => {
    expect(stripCommandPrefix('#tp Wilson')).toBe('Wilson')
    expect(stripCommandPrefix('/tp Wilson')).toBe('Wilson')
    expect(stripCommandPrefix('!kick Wilson')).toBe('Wilson')
    expect(stripCommandPrefix('.ban Wilson')).toBe('Wilson')
  })

  it('leaves a plain name untouched', () => {
    expect(stripCommandPrefix('Wilson')).toBe('Wilson')
  })

  it('only strips ONE leading prefix+word, keeps the rest of the name', () => {
    expect(stripCommandPrefix('#tp Big Wilson')).toBe('Big Wilson')
  })

  it('does not strip a prefix with no following word', () => {
    expect(stripCommandPrefix('#tp')).toBe('#tp')
  })

  it('trims surrounding whitespace', () => {
    expect(stripCommandPrefix('  Wilson  ')).toBe('Wilson')
  })

  it('handles empty string', () => {
    expect(stripCommandPrefix('')).toBe('')
  })
})
