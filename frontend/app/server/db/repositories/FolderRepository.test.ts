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
})
