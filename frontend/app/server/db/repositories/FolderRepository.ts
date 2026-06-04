import { eq, and, asc } from 'drizzle-orm'
import { getDb } from '../connection'
import { flowFolders, flows, type FlowFolder } from '../schema'

// Registers folder paths so the panel can create/keep EMPTY folders (a flow's
// membership is still its flows.folderPath; this table only makes a folder appear
// when no flow points at it yet). The UI tree merges these with the paths derived
// from flows. Paths are "/"-separated; "" (root) is implicit and never stored.
export class FolderRepository {
  constructor(private serverId: string) {}
  private get db() { return getDb(this.serverId) }

  findAll(): FlowFolder[] {
    return this.db.select().from(flowFolders)
      .where(eq(flowFolders.serverId, this.serverId))
      .orderBy(asc(flowFolders.path))
      .all()
  }

  // Create a folder (and all its ancestors, so "Loja/Eventos" also registers
  // "Loja"). Idempotent via the unique (serverId, path) index.
  create(path: string) {
    const clean = path.split('/').map(s => s.trim()).filter(Boolean)
    if (!clean.length) return
    const now = new Date()
    let acc = ''
    for (const seg of clean) {
      acc = acc ? `${acc}/${seg}` : seg
      const exists = this.db.select().from(flowFolders)
        .where(and(eq(flowFolders.serverId, this.serverId), eq(flowFolders.path, acc)))
        .get()
      if (!exists) {
        this.db.insert(flowFolders)
          .values({ serverId: this.serverId, path: acc, sortOrder: 0, createdAt: now })
          .run()
      }
    }
  }

  // How many flows live in this folder OR any subfolder (used to block deletion of
  // a non-empty folder).
  flowCountUnder(path: string): number {
    const rows = this.db.select({ fp: flows.folderPath }).from(flows)
      .where(eq(flows.serverId, this.serverId))
      .all()
    return rows.filter(r => r.fp === path || (r.fp ?? '').startsWith(path + '/')).length
  }

  // Delete a folder and its registered subfolders. Caller must ensure it's empty
  // of flows (LiveAutomation enforces the block-if-not-empty rule).
  delete(path: string) {
    const all = this.findAll()
    for (const f of all) {
      if (f.path === path || f.path.startsWith(path + '/')) {
        this.db.delete(flowFolders).where(eq(flowFolders.id, f.id)).run()
      }
    }
  }
}
