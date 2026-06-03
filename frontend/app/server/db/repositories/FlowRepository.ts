import { eq, desc } from 'drizzle-orm'
import { getDb } from '../connection'
import { flows, type Flow, type NewFlow, type FlowNode, type FlowEdge } from '../schema'

export class FlowRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  findAll(): Flow[] {
    return this.db.select().from(flows)
      .where(eq(flows.serverId, this.serverId))
      .orderBy(desc(flows.createdAt))
      .all()
  }

  findById(id: string): Flow | undefined {
    return this.db.select().from(flows)
      .where(eq(flows.id, id))
      .get()
  }

  findEnabled(): Flow[] {
    return this.db.select().from(flows)
      .where(eq(flows.serverId, this.serverId))
      .all()
      .filter(f => f.enabled)
  }

  save(flow: { id: string; name: string; enabled: boolean; nodes: FlowNode[]; edges: FlowEdge[]; triggerCount?: number; lastTriggered?: Date | null; defaultEnvironmentId?: number | null }) {
    const now = new Date()
    const existing = this.findById(flow.id)

    if (existing) {
      this.db.update(flows)
        .set({
          name: flow.name,
          enabled: flow.enabled,
          nodes: flow.nodes,
          edges: flow.edges,
          // Only overwrite the default environment when the caller provides the
          // field (undefined = leave as-is); null explicitly clears it.
          ...(flow.defaultEnvironmentId !== undefined ? { defaultEnvironmentId: flow.defaultEnvironmentId } : {}),
          updatedAt: now,
        })
        .where(eq(flows.id, flow.id))
        .run()
    } else {
      this.db.insert(flows)
        .values({
          id: flow.id,
          name: flow.name,
          enabled: flow.enabled,
          serverId: this.serverId,
          nodes: flow.nodes,
          edges: flow.edges,
          triggerCount: 0,
          defaultEnvironmentId: flow.defaultEnvironmentId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  }

  delete(id: string) {
    this.db.delete(flows).where(eq(flows.id, id)).run()
  }

  toggle(id: string, enabled: boolean) {
    this.db.update(flows)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(flows.id, id))
      .run()
  }

  updateStats(id: string, triggerCount: number) {
    this.db.update(flows)
      .set({ triggerCount, lastTriggered: new Date() })
      .where(eq(flows.id, id))
      .run()
  }
}
