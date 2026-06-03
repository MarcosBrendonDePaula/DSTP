import { eq, and } from 'drizzle-orm'
import { getDb } from '../connection'
import { environments, environmentSecrets } from '../schema'
import { encrypt, decrypt } from '../../services/SecretCrypto'
import { MIN_MASK_LEN } from '../../live/vault-mask'

// A secret must be long enough to mask safely (see vault-mask MIN_MASK_LEN) and
// not abusively large (memory + masking-DoS). Exported for the route schema.
export const MIN_SECRET_LEN = MIN_MASK_LEN
export const MAX_SECRET_LEN = 8 * 1024 // 8 KB — generous for keys/tokens

// Vault repository: environments (named groups) each holding N encrypted secrets.
// Listing methods NEVER return plaintext — only names/keys. Decryption is done
// explicitly via getSecretDecrypted, called lazily at flow-execution time.
export class EnvironmentRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  // ── Environments ──────────────────────────────────────────

  // List environments with the count of secrets in each (no values).
  listEnvironments(): Array<{ id: number; name: string; secretCount: number; updatedAt: Date }> {
    const envs = this.db.select().from(environments)
      .where(eq(environments.serverId, this.serverId))
      .all()
    return envs.map(e => ({
      id: e.id,
      name: e.name,
      updatedAt: e.updatedAt,
      secretCount: this.db.select().from(environmentSecrets)
        .where(eq(environmentSecrets.environmentId, e.id))
        .all().length,
    }))
  }

  getEnvironmentByName(name: string) {
    return this.db.select().from(environments)
      .where(and(eq(environments.serverId, this.serverId), eq(environments.name, name)))
      .get()
  }

  getEnvironmentById(id: number) {
    return this.db.select().from(environments)
      .where(and(eq(environments.id, id), eq(environments.serverId, this.serverId)))
      .get()
  }

  createEnvironment(name: string): number {
    const now = new Date()
    const rows = this.db.insert(environments)
      .values({ serverId: this.serverId, name, createdAt: now, updatedAt: now })
      .returning({ id: environments.id })
      .all()
    return rows[0].id
  }

  renameEnvironment(id: number, name: string): void {
    this.db.update(environments)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(environments.id, id), eq(environments.serverId, this.serverId)))
      .run()
  }

  deleteEnvironment(id: number): void {
    // Remove the secrets first (no FK cascade in SQLite by default here).
    this.db.delete(environmentSecrets).where(eq(environmentSecrets.environmentId, id)).run()
    this.db.delete(environments)
      .where(and(eq(environments.id, id), eq(environments.serverId, this.serverId)))
      .run()
  }

  // ── Secrets within an environment ─────────────────────────

  // Ownership guard: a secret op is only allowed if the environment belongs to
  // THIS server. Prevents acting on an env id from outside this server's scope
  // (defense in depth — today each server has its own DB, but this keeps the
  // authorization explicit and survives any future shared-DB change).
  private assertOwned(environmentId: number): void {
    if (!this.getEnvironmentById(environmentId)) {
      throw new Error('environment not found for this server')
    }
  }

  // Keys only — never values.
  listSecretKeys(environmentId: number): Array<{ key: string; updatedAt: Date }> {
    this.assertOwned(environmentId)
    return this.db.select().from(environmentSecrets)
      .where(eq(environmentSecrets.environmentId, environmentId))
      .all()
      .map(s => ({ key: s.key, updatedAt: s.updatedAt }))
  }

  // Upsert a secret (encrypts the value). Throws VaultDisabledError if the
  // master key is missing — we never store plaintext.
  setSecret(environmentId: number, key: string, plain: string): void {
    this.assertOwned(environmentId)
    // Reject values that can't be masked safely (too short → over-masking) or
    // that are abusively large (memory + masking DoS). Keep this the single
    // source of truth so the documented "rejected at write time" holds.
    if (typeof plain !== 'string' || plain.length < MIN_SECRET_LEN) {
      throw new Error(`secret too short (min ${MIN_SECRET_LEN} chars)`)
    }
    if (plain.length > MAX_SECRET_LEN) {
      throw new Error(`secret too large (max ${MAX_SECRET_LEN} chars)`)
    }
    const valueEnc = encrypt(plain)
    const existing = this.db.select().from(environmentSecrets)
      .where(and(eq(environmentSecrets.environmentId, environmentId), eq(environmentSecrets.key, key)))
      .get()
    if (existing) {
      this.db.update(environmentSecrets)
        .set({ valueEnc, updatedAt: new Date() })
        .where(eq(environmentSecrets.id, existing.id))
        .run()
    } else {
      this.db.insert(environmentSecrets)
        .values({ environmentId, key, valueEnc, updatedAt: new Date() })
        .run()
    }
  }

  // Decrypt a single secret by environment name + key. Returns undefined if not
  // found. Throws VaultDisabledError if the vault is disabled.
  getSecretDecrypted(envName: string, key: string): string | undefined {
    const env = this.getEnvironmentByName(envName)
    if (!env) return undefined
    const row = this.db.select().from(environmentSecrets)
      .where(and(eq(environmentSecrets.environmentId, env.id), eq(environmentSecrets.key, key)))
      .get()
    if (!row) return undefined
    return decrypt(row.valueEnc)
  }

  // Decrypt a secret by key from a specific environment id (the flow's default).
  getSecretByEnvId(environmentId: number, key: string): string | undefined {
    this.assertOwned(environmentId)
    const row = this.db.select().from(environmentSecrets)
      .where(and(eq(environmentSecrets.environmentId, environmentId), eq(environmentSecrets.key, key)))
      .get()
    if (!row) return undefined
    return decrypt(row.valueEnc)
  }

  deleteSecret(environmentId: number, key: string): void {
    this.assertOwned(environmentId)
    this.db.delete(environmentSecrets)
      .where(and(eq(environmentSecrets.environmentId, environmentId), eq(environmentSecrets.key, key)))
      .run()
  }
}
