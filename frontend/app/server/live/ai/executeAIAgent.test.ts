import { describe, it, expect } from 'vitest'
import { discoverToolNodes, schemaForNode, toolNameFor } from './executeAIAgent'
import type { FlowNode, FlowEdge } from '../../db'

const node = (id: string, type: string, data: any = {}): FlowNode =>
  ({ id, type, data, position: { x: 0, y: 0 } } as any)

describe('discoverToolNodes', () => {
  const ai = node('ai1', 'ai_agent')
  const heal = node('n_heal', 'action', { action_type: 'heal' })
  const ann = node('n_ann', 'action', { action_type: 'announce' })
  const other = node('n_other', 'action', { action_type: 'kick' })
  const nodes = [ai, heal, ann, other]

  it('returns only nodes wired to the tools handle', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', source: 'n_heal', target: 'ai1', targetHandle: 'tools' },
      { id: 'e2', source: 'n_ann', target: 'ai1', targetHandle: 'tools' },
      // a normal flow edge into the agent (top handle) is NOT a tool
      { id: 'e3', source: 'n_other', target: 'ai1' },
    ] as any
    const tools = discoverToolNodes(ai, nodes, edges)
    expect(tools.map(t => t.id).sort()).toEqual(['n_ann', 'n_heal'])
  })

  it('never includes the agent itself or another ai_agent', () => {
    const ai2 = node('ai2', 'ai_agent')
    const edges: FlowEdge[] = [
      { id: 'e1', source: 'ai1', target: 'ai1', targetHandle: 'tools' },
      { id: 'e2', source: 'ai2', target: 'ai1', targetHandle: 'tools' },
    ] as any
    const tools = discoverToolNodes(ai, [ai, ai2], edges)
    expect(tools).toEqual([])
  })

  it('dedupes a node wired twice', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', source: 'n_heal', target: 'ai1', targetHandle: 'tools' },
      { id: 'e2', source: 'n_heal', target: 'ai1', targetHandle: 'tools' },
    ] as any
    expect(discoverToolNodes(ai, nodes, edges).length).toBe(1)
  })
})

describe('schemaForNode', () => {
  it('maps numeric/boolean/string params to JSON Schema types', () => {
    const n = node('x', 'action', { action_type: 'heal', params: { userid: '', amount: '', enabled: '' } })
    const s = schemaForNode(n)
    expect(s.type).toBe('object')
    expect(s.properties.userid.type).toBe('string')
    expect(s.properties.amount.type).toBe('number')
    expect(s.properties.enabled.type).toBe('boolean')
    expect(s.additionalProperties).toBe(false)
  })

  it('produces an empty object schema for a paramless node', () => {
    const s = schemaForNode(node('x', 'action', { action_type: 'pause' }))
    expect(s.properties).toEqual({})
  })
})

describe('toolNameFor', () => {
  it('uses alias, then action_type, then type; sanitizes', () => {
    const used = new Set<string>()
    expect(toolNameFor(node('a', 'action', { alias: 'Heal Player!' }), used)).toBe('Heal_Player')
    expect(toolNameFor(node('b', 'action', { action_type: 'give_item' }), used)).toBe('give_item')
    expect(toolNameFor(node('c', 'get_player'), used)).toBe('get_player')
  })

  it('dedupes collisions with a numeric suffix', () => {
    const used = new Set<string>()
    expect(toolNameFor(node('a', 'action', { action_type: 'heal' }), used)).toBe('heal')
    expect(toolNameFor(node('b', 'action', { action_type: 'heal' }), used)).toBe('heal_2')
    expect(toolNameFor(node('c', 'action', { action_type: 'heal' }), used)).toBe('heal_3')
  })
})
