// Tests for the empty-folder registry: create() registers a path + ancestors
// idempotently, flowCountUnder() counts flows in a folder and its subfolders
// (the block-if-not-empty guard), and delete() removes a folder + its subfolders.
// Runs under `bun test`.
import { describe, it, expect, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FolderRepository } from './FolderRepository'
import { FlowRepository } from './FlowRepository'

const SERVER = `__test_folders_${Date.now()}`
const folders = () => new FolderRepository(SERVER)
const flowsRepo = () => new FlowRepository(SERVER)

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

describe('FolderRepository', () => {
  it('create registers the path AND its ancestors, idempotently', () => {
    folders().create('Loja/Eventos/Boss')
    const paths = folders().findAll().map(f => f.path).sort()
    expect(paths).toEqual(['Loja', 'Loja/Eventos', 'Loja/Eventos/Boss'])
    // calling again does not duplicate
    folders().create('Loja/Eventos')
    expect(folders().findAll().filter(f => f.path === 'Loja/Eventos').length).toBe(1)
  })

  it('flowCountUnder counts flows in the folder and its subfolders', () => {
    flowsRepo().save({ id: 'a', name: 'a', enabled: true, nodes: [], edges: [], folderPath: 'Loja' })
    flowsRepo().save({ id: 'b', name: 'b', enabled: true, nodes: [], edges: [], folderPath: 'Loja/Eventos' })
    flowsRepo().save({ id: 'c', name: 'c', enabled: true, nodes: [], edges: [], folderPath: 'Outra' })
    expect(folders().flowCountUnder('Loja')).toBe(2)       // a + b (subfolder)
    expect(folders().flowCountUnder('Loja/Eventos')).toBe(1) // b
    expect(folders().flowCountUnder('Vazia')).toBe(0)
  })

  it('delete removes the folder and its registered subfolders', () => {
    folders().create('Temp/Sub')
    folders().delete('Temp')
    const paths = folders().findAll().map(f => f.path)
    expect(paths).not.toContain('Temp')
    expect(paths).not.toContain('Temp/Sub')
  })

  it('reparent moves a folder under a new parent, cascading subfolders + flows', () => {
    const s = `__test_reparent_${Date.now()}`
    const fr = new FolderRepository(s)
    const flr = new FlowRepository(s)
    fr.create('A/Sub')
    fr.create('B')
    flr.save({ id: 'f1', name: 'f1', enabled: true, nodes: [], edges: [], folderPath: 'A' })
    flr.save({ id: 'f2', name: 'f2', enabled: true, nodes: [], edges: [], folderPath: 'A/Sub' })

    const np = fr.reparent('A', 'B')           // A → B/A
    expect(np).toBe('B/A')
    const paths = fr.findAll().map(x => x.path).sort()
    expect(paths).toContain('B/A')
    expect(paths).toContain('B/A/Sub')
    expect(flr.findById('f1')!.folderPath).toBe('B/A')
    expect(flr.findById('f2')!.folderPath).toBe('B/A/Sub')

    for (const suffix of ['', '-shm', '-wal']) {
      try { rmSync(join(process.cwd(), 'data', `${s}.sqlite`) + suffix) } catch { /* ignore */ }
    }
  })

  it('reparent into itself or its own subtree is rejected', () => {
    folders().create('X/Y')
    expect(folders().reparent('X', 'X')).toBeNull()      // into itself
    expect(folders().reparent('X', 'X/Y')).toBeNull()    // into descendant
  })

  it('rename changes the leaf and cascades to subfolders + flows', () => {
    const s = `__test_rename_${Date.now()}`
    const fr = new FolderRepository(s)
    const flr = new FlowRepository(s)
    fr.create('Velha/Sub')
    flr.save({ id: 'r1', name: 'r1', enabled: true, nodes: [], edges: [], folderPath: 'Velha/Sub' })
    const np = fr.rename('Velha', 'Nova')
    expect(np).toBe('Nova')
    expect(fr.findAll().map(x => x.path).sort()).toEqual(['Nova', 'Nova/Sub'])
    expect(flr.findById('r1')!.folderPath).toBe('Nova/Sub')
    for (const suffix of ['', '-shm', '-wal']) {
      try { rmSync(join(process.cwd(), 'data', `${s}.sqlite`) + suffix) } catch { /* ignore */ }
    }
  })
})
