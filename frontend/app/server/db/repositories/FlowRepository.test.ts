// Tests for folder/order organization on flows: move() updates only
// folderPath/sortOrder, save() partial-updates them (omitting must NOT reset a
// flow's folder — the editor's save omits them), and findAll orders by sortOrder.
// Runs under `bun test`.
import { describe, it, expect, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowRepository } from './FlowRepository'

const SERVER = `__test_flowrepo_${Date.now()}`
const repo = () => new FlowRepository(SERVER)

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

const mk = (id: string, extra: any = {}) =>
  repo().save({ id, name: id, enabled: true, nodes: [{ id: 'n1' } as any], edges: [], ...extra })

describe('FlowRepository — folders & order', () => {
  it('new flows default to root folder and order 0', () => {
    mk('a')
    const a = repo().findById('a')!
    expect(a.folderPath).toBe('')
    expect(a.sortOrder).toBe(0)
  })

  it('move() sets folderPath + sortOrder without touching nodes', () => {
    mk('b')
    repo().move('b', 'Loja/Eventos', 3)
    const b = repo().findById('b')!
    expect(b.folderPath).toBe('Loja/Eventos')
    expect(b.sortOrder).toBe(3)
    expect((b.nodes as any[]).length).toBe(1) // nodes preserved
  })

  it('save() WITHOUT folder fields does not reset an existing folder (editor save)', () => {
    mk('c')
    repo().move('c', 'Boss', 1)
    // simulate an editor save: same id/name/nodes, no folderPath/sortOrder
    repo().save({ id: 'c', name: 'c-renamed', enabled: true, nodes: [{ id: 'n1' } as any, { id: 'n2' } as any], edges: [] })
    const c = repo().findById('c')!
    expect(c.folderPath).toBe('Boss')   // preserved
    expect(c.sortOrder).toBe(1)         // preserved
    expect(c.name).toBe('c-renamed')    // name updated
    expect((c.nodes as any[]).length).toBe(2)
  })

  it('save() WITH folder fields seeds them (import/create)', () => {
    repo().save({ id: 'd', name: 'd', enabled: true, nodes: [], edges: [], folderPath: 'Tags', sortOrder: 5 })
    const d = repo().findById('d')!
    expect(d.folderPath).toBe('Tags')
    expect(d.sortOrder).toBe(5)
  })

  it('findAll orders by sortOrder ascending', () => {
    const s = `__test_flowrepo_order_${Date.now()}`
    const r = new FlowRepository(s)
    r.save({ id: 'x', name: 'x', enabled: true, nodes: [], edges: [], sortOrder: 2 })
    r.save({ id: 'y', name: 'y', enabled: true, nodes: [], edges: [], sortOrder: 0 })
    r.save({ id: 'z', name: 'z', enabled: true, nodes: [], edges: [], sortOrder: 1 })
    expect(r.findAll().map(f => f.id)).toEqual(['y', 'z', 'x'])
    for (const suffix of ['', '-shm', '-wal']) {
      try { rmSync(join(process.cwd(), 'data', `${s}.sqlite`) + suffix) } catch { /* ignore */ }
    }
  })
})
