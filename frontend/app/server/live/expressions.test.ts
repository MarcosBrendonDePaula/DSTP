import { describe, it, expect } from 'vitest'
import { resolveValue } from './expressions'

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
