import { desc, sql } from 'drizzle-orm'
import { getDb } from '../connection'
import { automationLogs, type AutomationLog } from '../schema'

export class AutomationLogRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  findRecent(limit = 100): AutomationLog[] {
    return this.db.select().from(automationLogs)
      .orderBy(desc(automationLogs.id))
      .limit(limit)
      .all()
  }

  create(log: { flowId: string; flowName: string; eventType: string; actions: string[] }) {
    this.db.insert(automationLogs)
      .values({
        flowId: log.flowId,
        flowName: log.flowName,
        eventType: log.eventType,
        actions: log.actions,
        timestamp: new Date(),
      })
      .run()

    // Keep last 500
    this.db.run(sql`DELETE FROM automation_logs WHERE id NOT IN (SELECT id FROM automation_logs ORDER BY id DESC LIMIT 500)`)
  }

  clear() {
    this.db.delete(automationLogs).run()
  }
}
