import { and, eq, gt, lt } from 'drizzle-orm'
import { getSessionsDb } from '../sessionsConnection'
import { panelSessions } from '../sessionsSchema'

export class PanelSessionsRepository {
  private get db() { return getSessionsDb() }

  grant(token: string, serverId: string, ttlMs: number): void {
    const now = Date.now()
    this.db.insert(panelSessions)
      .values({ token, serverId, createdAt: new Date(now), expiresAt: new Date(now + ttlMs) })
      .onConflictDoUpdate({
        target: [panelSessions.token, panelSessions.serverId],
        set: { expiresAt: new Date(now + ttlMs) },
      })
      .run()
  }

  has(token: string, serverId: string): boolean {
    const row = this.db.select().from(panelSessions)
      .where(and(eq(panelSessions.token, token), eq(panelSessions.serverId, serverId)))
      .get()
    if (!row) return false
    if (Date.now() > row.expiresAt.getTime()) {
      this.revoke(token, serverId)
      return false
    }
    return true
  }

  listServers(token: string): string[] {
    const rows = this.db.select({ serverId: panelSessions.serverId }).from(panelSessions)
      .where(and(eq(panelSessions.token, token), gt(panelSessions.expiresAt, new Date())))
      .all()
    return rows.map(r => r.serverId)
  }

  revoke(token: string, serverId?: string): void {
    if (serverId) {
      this.db.delete(panelSessions)
        .where(and(eq(panelSessions.token, token), eq(panelSessions.serverId, serverId)))
        .run()
    } else {
      this.db.delete(panelSessions).where(eq(panelSessions.token, token)).run()
    }
  }

  cleanupExpired(): void {
    this.db.delete(panelSessions).where(lt(panelSessions.expiresAt, new Date())).run()
  }
}
