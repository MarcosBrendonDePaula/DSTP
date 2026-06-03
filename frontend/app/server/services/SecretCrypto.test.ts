import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encrypt, decrypt, isVaultEnabled, VaultDisabledError, __setKeyForTest } from './SecretCrypto'

// The master key comes from FluxStack config (servicesConfig.vault.secretKey),
// frozen at import. Tests override it deterministically via __setKeyForTest —
// no env/config mutation, so suites can't leak a key into the environment.
function setKey(v: string | undefined) { __setKeyForTest(v ?? null) }

describe('SecretCrypto', () => {
  beforeEach(() => setKey('test-master-key-123'))
  afterEach(() => __setKeyForTest(undefined)) // clear override → back to config

  it('round-trips a value', () => {
    const blob = encrypt('sk-ant-super-secret')
    expect(blob).not.toContain('sk-ant-super-secret') // ciphertext, not plaintext
    expect(blob.startsWith('v1:')).toBe(true)
    expect(decrypt(blob)).toBe('sk-ant-super-secret')
  })

  it('produces different ciphertext each time (random IV)', () => {
    const a = encrypt('same')
    const b = encrypt('same')
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe('same')
    expect(decrypt(b)).toBe('same')
  })

  it('fails to decrypt with a different master key', () => {
    const blob = encrypt('secret')
    setKey('a-totally-different-key')
    expect(() => decrypt(blob)).toThrow()
  })

  it('rejects a tampered payload (GCM auth)', () => {
    const blob = encrypt('secret')
    const parts = blob.split(':')
    // Flip a byte in the ciphertext
    const ct = Buffer.from(parts[3], 'base64')
    ct[0] ^= 0xff
    parts[3] = ct.toString('base64')
    expect(() => decrypt(parts.join(':'))).toThrow()
  })

  it('throws VaultDisabledError when the master key is absent', () => {
    setKey(undefined)
    expect(isVaultEnabled()).toBe(false)
    expect(() => encrypt('x')).toThrow(VaultDisabledError)
    expect(() => decrypt('v1:a:b:c')).toThrow(VaultDisabledError)
  })

  it('reports enabled when key is present', () => {
    expect(isVaultEnabled()).toBe(true)
  })
})
