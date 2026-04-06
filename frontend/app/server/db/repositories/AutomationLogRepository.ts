import { desc, sql } from 'drizzle-orm'
import { getDb } from '../connection'
import { automationLogs, type AutomationLog } from '../schema'

export class AutomationLogRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  findRecent(limit = 100): AutomationLog[] {
    const rows = this.db.select().from(automationLogs)
      .orderBy(desc(automationLogs.id))
      .limit(limit)
      .all()

    // Parse JSON fields that come back as strings
    return rows.map(row => ({
      ...row,
      actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions,
      context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context,
    }))
  }

  create(log: { flowId: string; flowName: string; eventType: string; actions: string[]; context?: Record<string, any> }) {
    this.db.insert(automationLogs)
      .values({
        flowId: log.flowId,
        flowName: log.flowName,
        eventType: log.eventType,
        actions: log.actions,
        context: log.context ? JSON.stringify(log.context) : null,
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
