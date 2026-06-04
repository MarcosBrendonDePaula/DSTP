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
      .orderBy(asc(flowFolders.sortOrder), asc(flowFolders.path))
      .all()
  }

  setOrder(path: string, sortOrder: number) {
    this.db.update(flowFolders)
      .set({ sortOrder })
      .where(and(eq(flowFolders.serverId, this.serverId), eq(flowFolders.path, path)))
      .run()
  }

  // Move a folder under a new parent ("" = root), renaming it and ALL its
  // registered subfolders + every flow's folderPath that lived under it. Atomic-ish
  // (one server, sequential updates). Refuses to move a folder into itself/its own
  // subtree. Returns the new path, or null if the move was rejected.
  reparent(path: string, newParent: string, sortOrder = 0): string | null {
    const name = path.split('/').pop()!
    const np = newParent.trim()
    const newPath = np ? `${np}/${name}` : name
    if (newPath === path) return path
    // can't drop a folder into itself or a descendant
    if (np === path || np.startsWith(path + '/')) return null

    const renameOne = (oldP: string): string => newPath + oldP.slice(path.length)

    // 1) subfolders (and the folder itself)
    for (const f of this.findAll()) {
      if (f.path === path || f.path.startsWith(path + '/')) {
        this.db.update(flowFolders)
          .set({ path: renameOne(f.path), ...(f.path === path ? { sortOrder } : {}) })
          .where(eq(flowFolders.id, f.id))
          .run()
      }
    }
    // 2) flows under the moved subtree
    const affected = this.db.select().from(flows)
      .where(eq(flows.serverId, this.serverId))
      .all()
      .filter(r => r.folderPath === path || (r.folderPath ?? '').startsWith(path + '/'))
    for (const r of affected) {
      this.db.update(flows)
        .set({ folderPath: renameOne(r.folderPath), updatedAt: new Date() })
        .where(eq(flows.id, r.id))
        .run()
    }
    return newPath
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

  // Rename a folder's last segment (keeps the same parent), cascading to
  // subfolders + flows. Returns the new path, or null on a conflict/no-op.
  rename(path: string, newName: string): string | null {
    const clean = newName.split('/').map(s => s.trim()).filter(Boolean).join('/')
    if (!clean) return null
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const newPath = parent ? `${parent}/${clean}` : clean
    if (newPath === path) return path
    // reparent handles the cascade; renaming = reparent under the same parent with
    // a different leaf, so do the rename inline (reparent keeps the leaf name).
    const renameOne = (oldP: string): string => newPath + oldP.slice(path.length)
    for (const f of this.findAll()) {
      if (f.path === path || f.path.startsWith(path + '/')) {
        this.db.update(flowFolders).set({ path: renameOne(f.path) }).where(eq(flowFolders.id, f.id)).run()
      }
    }
    const affected = this.db.select().from(flows).where(eq(flows.serverId, this.serverId)).all()
      .filter(r => r.folderPath === path || (r.folderPath ?? '').startsWith(path + '/'))
    for (const r of affected) {
      this.db.update(flows).set({ folderPath: renameOne(r.folderPath), updatedAt: new Date() }).where(eq(flows.id, r.id)).run()
    }
    return newPath
  }

  // How many flows live in this folder OR any subfolder (used to block deletion of
  // a non-empty folder).
  flowCountUnder(path: string): number {
    const rows = this.db.select({ fp: flows.folderPath }).from(flows)
      .where(eq(flows.serverId, this.serverId))
      .all()
    return rows.filter(r => r.fp === path || (r.fp ?? '').startsWith(path + '/')).length
  }

  // Enable/disable EVERY flow in this folder and its subfolders. Returns how many
  // flows were touched.
  setEnabledUnder(path: string, enabled: boolean): number {
    const prefix = path + '/'
    const rows = this.db.select({ id: flows.id, fp: flows.folderPath }).from(flows)
      .where(eq(flows.serverId, this.serverId))
      .all()
      .filter(r => r.fp === path || (r.fp ?? '').startsWith(prefix))
    for (const r of rows) {
      this.db.update(flows).set({ enabled, updatedAt: new Date() }).where(eq(flows.id, r.id)).run()
    }
    return rows.length
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
