import { eq, asc, desc } from 'drizzle-orm'
import { getDb } from '../connection'
import { flows, type Flow, type NewFlow, type FlowNode, type FlowEdge } from '../schema'

export class FlowRepository {
  constructor(private serverId: string) {}

  private get db() { return getDb(this.serverId) }

  findAll(): Flow[] {
    // Manual order within a folder first (sortOrder), newest as tie-break. The UI
    // groups by folderPath into a tree and relies on this ordering inside a folder.
    return this.db.select().from(flows)
      .where(eq(flows.serverId, this.serverId))
      .orderBy(asc(flows.sortOrder), desc(flows.createdAt))
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

  save(flow: { id: string; name: string; enabled: boolean; nodes: FlowNode[]; edges: FlowEdge[]; triggerCount?: number; lastTriggered?: Date | null; defaultEnvironmentId?: number | null; folderPath?: string; sortOrder?: number }) {
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
          // Same partial-update rule for organization fields: a plain editor save
          // (which omits them) must NOT reset the flow's folder/order.
          ...(flow.folderPath !== undefined ? { folderPath: flow.folderPath } : {}),
          ...(flow.sortOrder !== undefined ? { sortOrder: flow.sortOrder } : {}),
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
          folderPath: flow.folderPath ?? '',
          sortOrder: flow.sortOrder ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  }

  // Move/reorder a flow: update only folder + order, never nodes/edges — so it's
  // safe against the editor's auto-save races. Mirrors toggle/updateStats.
  move(id: string, folderPath: string, sortOrder: number) {
    this.db.update(flows)
      .set({ folderPath, sortOrder, updatedAt: new Date() })
      .where(eq(flows.id, id))
      .run()
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
