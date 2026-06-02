// Runs under `bun test` (not vitest) because PanelAuthStore transitively
// imports bun:sqlite via @server/db, which only the Bun runtime resolves.
// Magic-link logic itself never touches the DB.
import { describe, it, expect, beforeEach, afterEach, setSystemTime } from 'bun:test'
import { issueMagicLink, consumeMagicLink } from './PanelAuthStore'

// Magic links are one-shot tokens granting a server's panel access for 2
// minutes. These tests pin the security-relevant behavior: single use + expiry.
describe('magic links', () => {
  beforeEach(() => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => {
    setSystemTime() // reset to real clock
  })

  it('issues a token that resolves to its server id', () => {
    const token = issueMagicLink('server-A')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
    expect(consumeMagicLink(token)).toBe('server-A')
  })

  it('is one-shot — a second consume returns null', () => {
    const token = issueMagicLink('server-B')
    expect(consumeMagicLink(token)).toBe('server-B')
    expect(consumeMagicLink(token)).toBeNull()
  })

  it('expires after 2 minutes', () => {
    const token = issueMagicLink('server-C')
    setSystemTime(new Date('2026-01-01T00:02:01Z')) // just past TTL
    expect(consumeMagicLink(token)).toBeNull()
  })

  it('still valid just before the TTL', () => {
    const token = issueMagicLink('server-D')
    setSystemTime(new Date('2026-01-01T00:01:59Z')) // 1s before expiry
    expect(consumeMagicLink(token)).toBe('server-D')
  })

  it('returns null for an unknown or empty token', () => {
    expect(consumeMagicLink('does-not-exist')).toBeNull()
    expect(consumeMagicLink('')).toBeNull()
    expect(consumeMagicLink(null)).toBeNull()
    expect(consumeMagicLink(undefined)).toBeNull()
  })

  it('issues distinct tokens for repeated calls', () => {
    const a = issueMagicLink('server-E')
    const b = issueMagicLink('server-E')
    expect(a).not.toBe(b)
    expect(consumeMagicLink(a)).toBe('server-E')
    expect(consumeMagicLink(b)).toBe('server-E')
  })
})
