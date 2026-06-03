import { describe, it, expect, beforeEach } from 'vitest'
import { maskSecrets, getSink, recordSecret, __resetGlobalSecrets, MIN_MASK_LEN, MAX_GLOBAL_SECRETS, MAX_MASK_STRING_LEN } from './vault-mask'

// Build a context whose secret sink contains the given plaintext values, the way
// installVaultAccessors + takeSecret would after they were resolved at runtime.
function ctxWithSecrets(...values: string[]): Record<string, any> {
  const ctx: Record<string, any> = {}
  const sink = getSink(ctx)
  for (const v of values) recordSecret(sink, v)
  return ctx
}

describe('maskSecrets', () => {
  beforeEach(() => __resetGlobalSecrets())

  it('replaces a resolved secret inside strings', () => {
    const ctx = ctxWithSecrets('sk-ant-123456789')
    const out = maskSecrets({ key: 'sk-ant-123456789', note: 'using sk-ant-123456789 here' }, ctx)
    expect(out.key).toBe('***')
    expect(out.note).toBe('using *** here')
  })

  it('masks nested objects and arrays', () => {
    const ctx = ctxWithSecrets('TOPSECRET-VALUE')
    const out = maskSecrets({ a: { b: ['x', 'TOPSECRET-VALUE', { c: 'TOPSECRET-VALUE' }] } }, ctx)
    expect(out.a.b[1]).toBe('***')
    expect(out.a.b[2].c).toBe('***')
  })

  it('is a no-op when no secrets were resolved', () => {
    const ctx = ctxWithSecrets() // empty sink, empty global
    const input = { key: 'plain-value' }
    expect(maskSecrets(input, ctx)).toEqual(input)
  })

  it('is a no-op when there is no sink at all', () => {
    const input = { key: 'plain-value' }
    expect(maskSecrets(input, {})).toEqual(input)
  })

  it('handles cyclic objects without infinite loop', () => {
    const ctx = ctxWithSecrets('SECRET-CYCLIC')
    const obj: any = { token: 'SECRET-CYCLIC' }
    obj.self = obj
    const out = maskSecrets(obj, ctx)
    expect(out.token).toBe('***')
  })

  it('masks multiple distinct secrets', () => {
    const ctx = ctxWithSecrets('AAAA', 'BBBB')
    const out = maskSecrets({ x: 'AAAA and BBBB' }, ctx)
    expect(out.x).toBe('*** and ***')
  })

  // ── H2: short-value guard (anti over-masking / audit-trail DoS) ──
  it('does NOT mask values shorter than MIN_MASK_LEN', () => {
    expect(MIN_MASK_LEN).toBeGreaterThanOrEqual(4)
    const ctx = ctxWithSecrets('ab') // too short
    const out = maskSecrets({ text: 'ab cab dab — a banana' }, ctx)
    // unchanged: a 2-char "secret" must not shred unrelated text
    expect(out.text).toBe('ab cab dab — a banana')
  })

  it('treats the secret value literally (no regex injection)', () => {
    const ctx = ctxWithSecrets('a.*b+c')
    const out = maskSecrets({ x: 'before a.*b+c after', y: 'axxxbc' }, ctx)
    expect(out.x).toBe('before *** after')
    expect(out.y).toBe('axxxbc') // regex would have matched; literal must not
  })

  // ── C2: fail-closed via the process-global registry ──
  it('masks via the global registry even when the per-run sink is empty', () => {
    const run1 = ctxWithSecrets('GLOBAL-LEAKED-KEY')
    expect(maskSecrets({ k: 'GLOBAL-LEAKED-KEY' }, run1).k).toBe('***')

    // A later emit with a FRESH context (empty per-run sink) must still scrub it.
    const run2: Record<string, any> = {}
    getSink(run2) // empty sink
    const out = maskSecrets({ leaked: 'GLOBAL-LEAKED-KEY' }, run2)
    expect(out.leaked).toBe('***')
  })

  it('masks via the global registry even with NO context at all', () => {
    const ctx = ctxWithSecrets('NAKED-CONTEXT-KEY')
    maskSecrets({ k: 'NAKED-CONTEXT-KEY' }, ctx)
    const out = maskSecrets({ leaked: 'NAKED-CONTEXT-KEY' }) // no context arg
    expect(out.leaked).toBe('***')
  })

  it('__resetGlobalSecrets clears the registry (test isolation)', () => {
    ctxWithSecrets('EPHEMERAL-KEY')
    __resetGlobalSecrets()
    const out = maskSecrets({ k: 'EPHEMERAL-KEY' })
    expect(out.k).toBe('EPHEMERAL-KEY') // no longer known → not masked
  })

  // ── HIGH-2: linear performance under many secrets + large strings ──
  it('masks fast with many secrets over a large string (no O(n*m) blowup)', () => {
    const sink = getSink({})
    for (let i = 0; i < 500; i++) recordSecret(sink, `SECRET_VALUE_NUMBER_${i}`)
    const ctx = { __secretSink: sink } as any
    const big = ('lorem ipsum '.repeat(5000)) + ' SECRET_VALUE_NUMBER_42 ' + ('dolor '.repeat(5000))
    const start = Date.now()
    const out = maskSecrets({ body: big }, ctx)
    const elapsed = Date.now() - start
    expect(out.body).toContain('***')
    expect(out.body).not.toContain('SECRET_VALUE_NUMBER_42')
    expect(elapsed).toBeLessThan(500) // single-pass regex, not 500 × scans
  })

  it('drops (does not scan) an oversized string that contains a secret', () => {
    const ctx = ctxWithSecrets('OVERSIZE-SECRET-KEY')
    const huge = 'x'.repeat(MAX_MASK_STRING_LEN + 10) + 'OVERSIZE-SECRET-KEY'
    const out = maskSecrets({ body: huge }, ctx)
    expect(out.body).toBe('[redacted: oversized]')
    expect(out.body).not.toContain('OVERSIZE-SECRET-KEY')
  })

  it('leaves an oversized string without a secret untouched', () => {
    const ctx = ctxWithSecrets('SOME-OTHER-SECRET')
    const huge = 'y'.repeat(MAX_MASK_STRING_LEN + 10)
    const out = maskSecrets({ body: huge }, ctx)
    expect(out.body).toBe(huge)
  })

  // ── MED-1: global registry is FIFO-bounded ──
  it('bounds the global registry (eviction) without breaking current-run masking', () => {
    __resetGlobalSecrets()
    const sink = getSink({})
    for (let i = 0; i < MAX_GLOBAL_SECRETS + 50; i++) recordSecret(sink, `BOUNDED_SECRET_${i}`)
    // The per-run sink is authoritative for the in-flight run → still masks.
    const ctx = { __secretSink: sink } as any
    const out = maskSecrets({ a: 'BOUNDED_SECRET_5', b: 'BOUNDED_SECRET_1040' }, ctx)
    expect(out.a).toBe('***')
    expect(out.b).toBe('***')
  })

  it('longest-match-first: a value that is a prefix of another fully masks', () => {
    const ctx = ctxWithSecrets('ABCD', 'ABCDEFGH')
    const out = maskSecrets({ x: 'ABCDEFGH and ABCD' }, ctx)
    expect(out.x).toBe('*** and ***')
  })
})
