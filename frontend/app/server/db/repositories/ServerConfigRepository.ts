import { eq } from 'drizzle-orm'
import { getDb } from '../connection'
import { serverConfig } from '../schema'

// Per-server key/value config (feature flags + settings). The DB file is already
// per-server, so keys are global within it. Booleans are stored as '1'/'0'.
export class ServerConfigRepository {
  constructor(private serverId: string) {}
  private get db() { return getDb(this.serverId) }

  get(key: string): string | undefined {
    return this.db.select().from(serverConfig).where(eq(serverConfig.key, key)).get()?.value
  }

  getBool(key: string, fallback = false): boolean {
    const v = this.get(key)
    if (v == null) return fallback
    return v === '1' || v === 'true'
  }

  set(key: string, value: string): void {
    this.db.insert(serverConfig)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: serverConfig.key, set: { value, updatedAt: new Date() } })
      .run()
  }

  setBool(key: string, on: boolean): void {
    this.set(key, on ? '1' : '0')
  }

  /** All config as a plain object (for the settings UI). */
  all(): Record<string, string> {
    const rows = this.db.select().from(serverConfig).all()
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }
}
