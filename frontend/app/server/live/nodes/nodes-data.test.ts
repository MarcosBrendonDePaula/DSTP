// Unit tests for the data-category node handlers, run in isolation via makeRc.
import { describe, it, expect, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { makeRc } from './testkit'

import { handler as transform } from '../../../shared/automation/nodes/data/transform/transform/exec'
import { handler as split } from '../../../shared/automation/nodes/data/transform/split/exec'
import { handler as random } from '../../../shared/automation/nodes/data/random/random/exec'
import { handler as setVariable } from '../../../shared/automation/nodes/data/vars/set_variable/exec'
import { handler as listFlows } from '../../../shared/automation/nodes/data/store/list_flows/exec'
import { handler as memory } from '../../../shared/automation/nodes/data/store/memory/exec'
import { FlowRepository } from '../../db'

describe('transform node', () => {
  it('string ops', async () => {
    let s = makeRc({ data: { params: { value: 'Hi', operation: 'uppercase' } } }); await transform(s.rc); expect(s.out().value).toBe('HI')
    s = makeRc({ data: { params: { value: ' x ', operation: 'trim' } } }); await transform(s.rc); expect(s.out().value).toBe('x')
    s = makeRc({ data: { params: { value: 'abc', operation: 'length' } } }); await transform(s.rc); expect(s.out().value).toBe(3)
  })
  it('math ops', async () => {
    let s = makeRc({ data: { params: { value: '10', operation: 'add', operand: '5' } } }); await transform(s.rc); expect(s.out().value).toBe(15)
    s = makeRc({ data: { params: { value: '10', operation: 'div', operand: '0' } } }); await transform(s.rc); expect(s.out().value).toBe(0) // div by zero guard
  })
  it('after / before / replace', async () => {
    let s = makeRc({ data: { params: { value: 'buy:spear', operation: 'after', operand: ':' } } }); await transform(s.rc); expect(s.out().value).toBe('spear')
    s = makeRc({ data: { params: { value: 'buy:spear', operation: 'before', operand: ':' } } }); await transform(s.rc); expect(s.out().value).toBe('buy')
    s = makeRc({ data: { params: { value: '!dar 50', operation: 'after', operand: ' ' } } }); await transform(s.rc); expect(s.out().value).toBe('50')
    s = makeRc({ data: { params: { value: 'a-b-c', operation: 'replace', operand: '-' } } }); await transform(s.rc); expect(s.out().value).toBe('abc')
  })
  it('json parse/stringify', async () => {
    let s = makeRc({ data: { params: { value: '{"a":1}', operation: 'json_parse' } } }); await transform(s.rc); expect(s.out().value).toEqual({ a: 1 })
    s = makeRc({ data: { params: { value: { a: 1 }, operation: 'json_stringify' } } }); await transform(s.rc); expect(s.out().value).toBe('{"a":1}')
  })
})

describe('split node', () => {
  it('splits by whitespace and exposes parts/first/rest/count', async () => {
    const s = makeRc({ data: { params: { value: '!comprar lança 2', separator: '', trim: 'true' } } })
    await split(s.rc); const o = s.out()
    expect(o.parts).toEqual(['!comprar', 'lança', '2'])
    expect(o.first).toBe('!comprar'); expect(o.part2).toBe('lança'); expect(o.part3).toBe('2')
    expect(o.rest).toBe('lança 2'); expect(o.count).toBe(3)
  })
  it('custom separator + empty input', async () => {
    let s = makeRc({ data: { params: { value: 'a,b,c', separator: ',', trim: 'true' } } }); await split(s.rc); expect(s.out().parts).toEqual(['a', 'b', 'c'])
    s = makeRc({ data: { params: { value: '', separator: '', trim: 'true' } } }); await split(s.rc); expect(s.out().parts).toEqual([]); expect(s.out().count).toBe(0)
  })
})

describe('random node', () => {
  it('picks an int within [min,max]', async () => {
    const s = makeRc({ data: { params: { min: '3', max: '3' } } }); await random(s.rc)
    expect(s.out().value).toBe(3)
  })
  it('picks from a comma list', async () => {
    const s = makeRc({ data: { params: { list: 'a' } } }); await random(s.rc)
    expect(s.out().value).toBe('a'); expect(s.out().index).toBe(0)
  })
})

describe('set_variable node', () => {
  it('sets context to the result of executeSetVariable (engine helper)', async () => {
    // The handler delegates to the engine's executeSetVariable; here we stub it and
    // assert the handler wires its result into setContext and returns continue.
    const s = makeRc({
      data: { params: { key: 'greet', value: 'hi' } },
      overrides: { executeSetVariable: () => ({ greet: 'hi Wilson' }) },
    })
    const r = await setVariable(s.rc)
    expect(r).toBe('continue')
    expect(s.out()).toEqual({ greet: 'hi Wilson' })
  })
})

describe('list_flows node', () => {
  const SERVER = `__unit_listflows_${Date.now()}`
  afterAll(() => { for (const x of ['', '-shm', '-wal']) { try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + x) } catch {} } })
  it('filters by folder + enabled and exposes text/names/count', async () => {
    const repo = new FlowRepository(SERVER)
    repo.save({ id: 'a', name: '!hora', enabled: true, nodes: [{ id: 'n' } as any], edges: [], folderPath: 'Comandos' })
    repo.save({ id: 'b', name: '!dado', enabled: true, nodes: [], edges: [], folderPath: 'Comandos' })
    repo.save({ id: 'c', name: 'off', enabled: false, nodes: [], edges: [], folderPath: 'Comandos' })
    const s = makeRc({ serverId: SERVER, data: { params: { onlyEnabled: 'true', folder: 'Comandos', startsWith: '' } } })
    await listFlows(s.rc)
    expect(s.out().count).toBe(2)
    expect(s.out().names.sort()).toEqual(['!dado', '!hora'])
    expect(s.out().text).toContain('!hora')
  })
})

describe('memory node', () => {
  const SERVER = `__unit_memory_${Date.now()}`
  afterAll(() => { for (const x of ['', '-shm', '-wal']) { try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + x) } catch {} } })
  it('writes then reads a value (same namespace)', async () => {
    const w = makeRc({ serverId: SERVER, data: { action: 'write', params: { flow: 'ns', key: 'k', value: '42' } } })
    await memory(w.rc)
    const r = makeRc({ serverId: SERVER, data: { action: 'read', params: { flow: 'ns', key: 'k' } } })
    await memory(r.rc)
    expect(String(r.out().value)).toBe('42')
  })
})
