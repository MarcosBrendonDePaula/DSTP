import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from '../connection'
import { eventHistory, type EventHistoryEntry } from '../schema'

export class EventHistoryRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  findRecent(limit = 100, type?: string): EventHistoryEntry[] {
    let query = this.db.select().from(eventHistory)

    if (type) {
      return query.where(eq(eventHistory.type, type))
        .orderBy(desc(eventHistory.id))
        .limit(limit)
        .all()
    }

    return query
      .orderBy(desc(eventHistory.id))
      .limit(limit)
      .all()
  }

  create(event: { type: string; shardId?: string; shardType?: string; data: Record<string, any> }) {
    this.db.insert(eventHistory)
      .values({
        type: event.type,
        shardId: event.shardId || null,
        shardType: event.shardType || null,
        data: event.data,
        timestamp: new Date(),
      })
      .run()

    // Keep last 5000
    this.db.run(sql`DELETE FROM event_history WHERE id NOT IN (SELECT id FROM event_history ORDER BY id DESC LIMIT 5000)`)
  }
}
