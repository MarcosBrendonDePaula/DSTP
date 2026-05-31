import { randomBytes } from 'crypto'
import { PanelAuthRepository, PanelSessionsRepository } from '@server/db'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAGIC_LINK_TTL_MS = 2 * 60 * 1000 // 2 minutes

// Pending setup tokens (in-memory, regenerated on restart if not consumed)
const setupTokens = new Map<string, string>()

// One-shot magic link tokens: serverId:token -> expiresAt
interface MagicLink { serverId: string; expiresAt: number }
const magicLinks = new Map<string, MagicLink>()

const sessions = () => new PanelSessionsRepository()
const authRepo = (serverId: string) => new PanelAuthRepository(serverId)

export function isSetup(serverId: string): boolean {
  return authRepo(serverId).isSetup()
}

export function getOrCreateSetupToken(serverId: string): string {
  const existing = setupTokens.get(serverId)
  if (existing) return existing
  const token = randomBytes(16).toString('hex')
  setupTokens.set(serverId, token)
  return token
}

export function announceSetupTokenIfNeeded(serverId: string) {
  if (isSetup(serverId)) return
  if (setupTokens.has(serverId)) return
  const token = getOrCreateSetupToken(serverId)
  console.log('')
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log(`║  🔐 Novo servidor detectado: ${serverId.padEnd(33)}║`)
  console.log('║  Setup inicial necessário. Token (use na tela de setup):     ║')
  console.log(`║  ${token.padEnd(61)}║`)
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log('')
}

export async function completeSetup(serverId: string, token: string, password: string): Promise<{ ok: boolean; reason?: string }> {
  const repo = authRepo(serverId)
  if (repo.isSetup()) return { ok: false, reason: 'already_setup' }
  const expected = setupTokens.get(serverId)
  if (!expected || token !== expected) return { ok: false, reason: 'invalid_token' }
  if (!password || password.length < 6) return { ok: false, reason: 'weak_password' }

  const hash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 })
  repo.create(hash)
  setupTokens.delete(serverId)
  return { ok: true }
}

export async function verifyPassword(serverId: string, password: string): Promise<boolean> {
  const row = authRepo(serverId).find()
  if (!row) return false
  return Bun.password.verify(password, row.passwordHash)
}

export async function changePassword(serverId: string, currentPassword: string, newPassword: string): Promise<{ ok: boolean; reason?: string }> {
  if (!newPassword || newPassword.length < 6) return { ok: false, reason: 'weak_password' }
  const ok = await verifyPassword(serverId, currentPassword)
  if (!ok) return { ok: false, reason: 'invalid_password' }
  const hash = await Bun.password.hash(newPassword, { algorithm: 'bcrypt', cost: 10 })
  authRepo(serverId).updatePassword(hash)
  return { ok: true }
}

/** Sets the initial password for a server that has none yet. Used after magic-link first access. */
export async function setInitialPassword(serverId: string, password: string): Promise<{ ok: boolean; reason?: string }> {
  const repo = authRepo(serverId)
  if (repo.isSetup()) return { ok: false, reason: 'already_setup' }
  if (!password || password.length < 6) return { ok: false, reason: 'weak_password' }
  const hash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 })
  repo.create(hash)
  return { ok: true }
}

export function grantSession(serverId: string, existingToken?: string | null): string {
  const token = existingToken && existingToken.length === 64 ? existingToken : randomBytes(32).toString('hex')
  sessions().grant(token, serverId, SESSION_TTL_MS)
  return token
}

export function hasSession(token: string | undefined | null, serverId: string): boolean {
  if (!token) return false
  return sessions().has(token, serverId)
}

export function listAuthorizedServers(token: string | undefined | null): string[] {
  if (!token) return []
  return sessions().listServers(token)
}

export function revokeSession(token: string | undefined | null, serverId?: string): void {
  if (!token) return
  sessions().revoke(token, serverId)
}

export function cleanupExpiredSessions(): void {
  sessions().cleanupExpired()
}

// ─── Magic links (one-shot access tokens) ────────────

export function issueMagicLink(serverId: string): string {
  pruneExpiredMagicLinks()
  const token = randomBytes(24).toString('hex')
  magicLinks.set(token, { serverId, expiresAt: Date.now() + MAGIC_LINK_TTL_MS })
  return token
}

/** Consume a magic link (one-shot). Returns serverId if valid, else null. */
export function consumeMagicLink(token: string | undefined | null): string | null {
  if (!token) return null
  const entry = magicLinks.get(token)
  if (!entry) return null
  magicLinks.delete(token) // one-shot — burn it regardless of expiry
  if (Date.now() > entry.expiresAt) return null
  return entry.serverId
}

function pruneExpiredMagicLinks() {
  const now = Date.now()
  for (const [k, v] of magicLinks) {
    if (now > v.expiresAt) magicLinks.delete(k)
  }
}
