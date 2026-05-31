import { eq } from 'drizzle-orm'
import { getDb } from '../connection'
import { panelAuth, type PanelAuth } from '../schema'

export class PanelAuthRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  find(): PanelAuth | undefined {
    return this.db.select().from(panelAuth).where(eq(panelAuth.id, 1)).get()
  }

  isSetup(): boolean {
    return !!this.find()
  }

  create(passwordHash: string): void {
    const now = new Date()
    this.db.insert(panelAuth).values({ id: 1, passwordHash, createdAt: now, updatedAt: now }).run()
  }

  updatePassword(passwordHash: string): void {
    this.db.update(panelAuth)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(panelAuth.id, 1))
      .run()
  }
}
