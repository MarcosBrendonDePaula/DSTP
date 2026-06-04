import { eq, and, sql } from 'drizzle-orm'
import { getDb } from '../connection'
import { flowMemory } from '../schema'

export class FlowMemoryRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  get(flowId: string, key: string): any {
    const row = this.db.select().from(flowMemory)
      .where(and(eq(flowMemory.flowId, flowId), eq(flowMemory.key, key)))
      .get()
    if (!row) return undefined
    // The `value` column is text({ mode: 'json' }) — Drizzle already JSON-parses
    // on read, so `row.value` is the deserialized value. A second JSON.parse here
    // would throw on any value that serialized to a non-JSON string (e.g. the raw
    // string "cabin" → stored as "cabin" → JSON.parse("cabin") explodes).
    return row.value
  }

  set(flowId: string, key: string, value: any): void {
    const existing = this.db.select().from(flowMemory)
      .where(and(eq(flowMemory.flowId, flowId), eq(flowMemory.key, key)))
      .get()

    if (existing) {
      this.db.update(flowMemory)
        .set({ value, updatedAt: new Date() })
        .where(eq(flowMemory.id, existing.id))
        .run()
    } else {
      this.db.insert(flowMemory)
        .values({ flowId, key, value, updatedAt: new Date() })
        .run()
    }
  }

  delete(flowId: string, key: string): void {
    this.db.delete(flowMemory)
      .where(and(eq(flowMemory.flowId, flowId), eq(flowMemory.key, key)))
      .run()
  }

  getAll(flowId: string): Record<string, any> {
    const rows = this.db.select().from(flowMemory)
      .where(eq(flowMemory.flowId, flowId))
      .all()
    const result: Record<string, any> = {}
    for (const row of rows) {
      // Drizzle already JSON-parses the mode:'json' column — see get().
      result[row.key] = row.value
    }
    return result
  }

  clearFlow(flowId: string): void {
    this.db.delete(flowMemory).where(eq(flowMemory.flowId, flowId)).run()
  }
}
