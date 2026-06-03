// Runs under `bun test` (not vitest): EnvironmentRepository touches bun:sqlite
// via @server/db. Exercises the real encrypted round-trip + the security
// invariants the audit flagged (no plaintext in listings, IDOR guard).
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { __setKeyForTest } from '../../services/SecretCrypto'
import { EnvironmentRepository, MIN_SECRET_LEN, MAX_SECRET_LEN } from './EnvironmentRepository'

// The vault must be enabled for set/get to work. Force the key via the test-only
// override (NOT process.env — that leaks into the environment and breaks the dev
// server's stable key).
beforeAll(() => __setKeyForTest('test-master-key-env-repo'))

const SERVER_A = `__test_envrepo_A_${Date.now()}`
const SERVER_B = `__test_envrepo_B_${Date.now()}`

function dbPath(serverId: string) {
  return join(process.cwd(), 'data', `${serverId}.sqlite`)
}

afterAll(() => {
  for (const s of [SERVER_A, SERVER_B]) {
    for (const suffix of ['', '-shm', '-wal']) {
      try { rmSync(dbPath(s) + suffix) } catch { /* ignore */ }
    }
  }
})

describe('EnvironmentRepository — CRUD + crypto', () => {
  it('creates an environment and lists it without any value', () => {
    const repo = new EnvironmentRepository(SERVER_A)
    const id = repo.createEnvironment('prod')
    expect(id).toBeGreaterThan(0)
    const list = repo.listEnvironments()
    const env = list.find(e => e.name === 'prod')!
    expect(env).toBeDefined()
    expect(env.secretCount).toBe(0)
    // listing must not carry any value/blob field
    expect(JSON.stringify(list)).not.toContain('value')
  })

  it('round-trips a secret (encrypt at rest, decrypt on read)', () => {
    const repo = new EnvironmentRepository(SERVER_A)
    const env = repo.getEnvironmentByName('prod')!
    repo.setSecret(env.id, 'ANTHROPIC_KEY', 'sk-ant-supersecret-1234')
    expect(repo.getSecretDecrypted('prod', 'ANTHROPIC_KEY')).toBe('sk-ant-supersecret-1234')
    expect(repo.getSecretByEnvId(env.id, 'ANTHROPIC_KEY')).toBe('sk-ant-supersecret-1234')
  })

  it('listSecretKeys returns ONLY keys — never the plaintext or the blob', () => {
    const repo = new EnvironmentRepository(SERVER_A)
    const env = repo.getEnvironmentByName('prod')!
    const keys = repo.listSecretKeys(env.id)
    const dump = JSON.stringify(keys)
    expect(keys.map(k => k.key)).toContain('ANTHROPIC_KEY')
    expect(dump).not.toContain('sk-ant-supersecret-1234') // no plaintext
    expect(dump).not.toContain('v1:')                      // no ciphertext blob
  })

  it('overwrites a secret in place', () => {
    const repo = new EnvironmentRepository(SERVER_A)
    const env = repo.getEnvironmentByName('prod')!
    repo.setSecret(env.id, 'ANTHROPIC_KEY', 'sk-ant-rotated-9999')
    expect(repo.getSecretByEnvId(env.id, 'ANTHROPIC_KEY')).toBe('sk-ant-rotated-9999')
    expect(repo.listSecretKeys(env.id).filter(k => k.key === 'ANTHROPIC_KEY').length).toBe(1)
  })

  it('deletes a secret and an environment', () => {
    const repo = new EnvironmentRepository(SERVER_A)
    const env = repo.getEnvironmentByName('prod')!
    repo.deleteSecret(env.id, 'ANTHROPIC_KEY')
    expect(repo.getSecretByEnvId(env.id, 'ANTHROPIC_KEY')).toBeUndefined()
    repo.deleteEnvironment(env.id)
    expect(repo.getEnvironmentByName('prod')).toBeUndefined()
  })
})

describe('EnvironmentRepository — value size limits (MED-2/#3)', () => {
  it('rejects a too-short secret and a too-large secret', () => {
    const repo = new EnvironmentRepository(SERVER_A)
    const id = repo.createEnvironment('sizes')
    expect(() => repo.setSecret(id, 'SHORT', 'ab')).toThrow(/too short/)
    expect(() => repo.setSecret(id, 'BIG', 'x'.repeat(MAX_SECRET_LEN + 1))).toThrow(/too large/)
    // a normal-length value is accepted
    expect(() => repo.setSecret(id, 'OK', 'x'.repeat(MIN_SECRET_LEN))).not.toThrow()
    repo.deleteEnvironment(id)
  })
})

describe('EnvironmentRepository — authorization (IDOR guard, H3)', () => {
  it('refuses secret ops on an environment id that does not belong to the server', () => {
    const repoA = new EnvironmentRepository(SERVER_A)
    const repoB = new EnvironmentRepository(SERVER_B)
    const envA = repoA.createEnvironment('a-only')
    // Server B must not be able to touch server A's environment id.
    expect(() => repoB.setSecret(envA, 'X', 'leak')).toThrow()
    expect(() => repoB.listSecretKeys(envA)).toThrow()
    expect(() => repoB.getSecretByEnvId(envA, 'X')).toThrow()
    expect(() => repoB.deleteSecret(envA, 'X')).toThrow()
  })
})

describe('EnvironmentRepository — name uniqueness', () => {
  it('getEnvironmentByName is scoped to the server', () => {
    const repoA = new EnvironmentRepository(SERVER_A)
    const repoB = new EnvironmentRepository(SERVER_B)
    repoA.createEnvironment('shared-name')
    // Same name on B is a different row, and A's lookup never sees B's.
    expect(repoB.getEnvironmentByName('shared-name')).toBeUndefined()
    repoB.createEnvironment('shared-name')
    expect(repoB.getEnvironmentByName('shared-name')).toBeDefined()
  })
})
