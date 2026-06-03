// Symmetric encryption for stored secrets (API keys, tokens).
//
// Secrets live encrypted at rest in each server's SQLite (`secrets` table) and
// are only decrypted at the moment a node actually needs them (lazy, see the
// `secret.` resolution in FlowEngine). Plaintext never reaches the client, the
// flow JSON, logs, or traces.
//
// Cipher: AES-256-GCM (authenticated). The master key comes from DSTP_SECRET_KEY,
// read through FluxStack's declarative config (servicesConfig.vault.secretKey) so
// there's a SINGLE, stable source of truth — not a raw/ambiguous env read. It must
// stay stable across restarts: if it changes, every stored secret becomes
// undecryptable. Empty = vault DISABLED (encrypt/decrypt throw a clear error and
// callers surface "vault disabled" rather than storing plaintext).
//
// Stored format (single string):  v1:<iv_b64>:<tag_b64>:<ciphertext_b64>

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { servicesConfig } from '@config/system/services.config'

const VERSION = 'v1'
const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // 96-bit nonce, recommended for GCM

// Fixed application salt for key derivation. The real secret is DSTP_SECRET_KEY;
// the salt only ensures the derived key differs from a raw use of the env value.
const KDF_SALT = 'dstp.secret.vault.v1'

let cachedKey: Buffer | null = null
let cachedFrom: string | null = null
// Test-only override (see __setKeyForTest). null = use the real config source.
let testKeyOverride: string | null | undefined = undefined

// Derive (and cache) the 32-byte AES key from DSTP_SECRET_KEY.
// Returns null when the vault is disabled (key missing/empty).
function getKey(): Buffer | null {
  const raw = testKeyOverride !== undefined ? testKeyOverride : servicesConfig.vault.secretKey
  if (!raw || raw.trim() === '') return null
  if (cachedKey && cachedFrom === raw) return cachedKey
  // scrypt stretches whatever the user provides into a proper 32-byte key, so a
  // short passphrase or a 64-hex string both work.
  cachedKey = scryptSync(raw, KDF_SALT, 32)
  cachedFrom = raw
  return cachedKey
}

// True when DSTP_SECRET_KEY is configured and the vault can encrypt/decrypt.
export function isVaultEnabled(): boolean {
  return getKey() !== null
}

// Test-only: force the master key (bypassing config) so suites are deterministic
// without touching the global env/config. Pass undefined to clear the override.
export function __setKeyForTest(key: string | null | undefined): void {
  testKeyOverride = key
  cachedKey = null
  cachedFrom = null
}

// Test-only: drop the derived-key cache.
export function __resetKeyCache(): void {
  cachedKey = null
  cachedFrom = null
}

export class VaultDisabledError extends Error {
  constructor() {
    super('Secret vault disabled: set DSTP_SECRET_KEY in the backend environment')
    this.name = 'VaultDisabledError'
  }
}

// Encrypt plaintext → "v1:iv:tag:ciphertext" (all base64). Throws if disabled.
export function encrypt(plain: string): string {
  const key = getKey()
  if (!key) throw new VaultDisabledError()

  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':')
}

// Decrypt a "v1:iv:tag:ciphertext" blob back to plaintext. Throws if disabled,
// malformed, or authentication fails (tampered/ wrong key).
export function decrypt(blob: string): string {
  const key = getKey()
  if (!key) throw new VaultDisabledError()

  const parts = String(blob).split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed secret payload')
  }
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const ct = Buffer.from(parts[3], 'base64')

  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ct), decipher.final()])
  return plain.toString('utf8')
}
