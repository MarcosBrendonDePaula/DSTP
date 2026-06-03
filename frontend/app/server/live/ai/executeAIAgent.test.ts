import { describe, it, expect } from 'vitest'
import { discoverToolNodes, schemaForNode, toolNameFor, computeScopeKey, trimHistory, compactHistory, type ChatTurn } from './executeAIAgent'
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

  it('discovers an ai_memory node as a tool', () => {
    const mem = node('n_mem', 'ai_memory')
    const edges: FlowEdge[] = [
      { id: 'e1', source: 'n_mem', target: 'ai1', targetHandle: 'tools' },
    ] as any
    const tools = discoverToolNodes(ai, [ai, mem], edges)
    expect(tools.map(t => t.type)).toContain('ai_memory')
  })
})

describe('computeScopeKey (conversation memory)', () => {
  it('global scope ignores the player', () => {
    expect(computeScopeKey('global', { trigger: { userid: 'KU_1' } })).toBe('global')
  })
  it('player scope keys by userid', () => {
    expect(computeScopeKey('player', { trigger: { userid: 'KU_abc' } })).toBe('player:KU_abc')
  })
  it('player scope falls back to name, then unknown', () => {
    expect(computeScopeKey('player', { trigger: { name: 'Joe' } })).toBe('player:Joe')
    expect(computeScopeKey('player', { trigger: {} })).toBe('player:unknown')
  })
})

describe('trimHistory', () => {
  const turn = (i: number): ChatTurn => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })
  it('keeps only the last `limit` pairs (2*limit messages)', () => {
    const turns = Array.from({ length: 20 }, (_, i) => turn(i))
    const out = trimHistory(turns, 3)
    expect(out.length).toBe(6)
    expect(out[0].content).toBe('m14') // last 6 of 20
  })
  it('returns all when under the limit', () => {
    const turns = [turn(0), turn(1)]
    expect(trimHistory(turns, 10).length).toBe(2)
  })
  it('defaults to 10 pairs for a bad limit', () => {
    const turns = Array.from({ length: 50 }, (_, i) => turn(i))
    expect(trimHistory(turns, NaN as any).length).toBe(20)
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

  it('excludes params the author already fixed (only empty/template params are inputs)', () => {
    // chat_send: message empty (AI fills), name fixed "[IA]" (author set → fixed)
    const n = node('x', 'action', { action_type: 'chat_send', params: { message: '', name: '[IA]' } })
    const s = schemaForNode(n)
    expect(Object.keys(s.properties)).toEqual(['message'])
    expect(s.properties.name).toBeUndefined()
  })

  it('exposes a template-valued param as a fillable input', () => {
    const n = node('x', 'action', { action_type: 'heal', params: { userid: '{{trigger.userid}}', amount: '50' } })
    const s = schemaForNode(n)
    // userid is a template (placeholder) → fillable; amount fixed at 50 → not
    expect(Object.keys(s.properties)).toEqual(['userid'])
  })
})

describe('compactHistory', () => {
  const turn = (i: number): ChatTurn => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })

  it('returns unchanged when under the limit', async () => {
    const turns = [turn(0), turn(1)]
    expect(await compactHistory(turns, 5)).toEqual(turns)
  })

  it('without a summarizer, behaves like rotate (keeps last 2*limit)', async () => {
    const turns = Array.from({ length: 20 }, (_, i) => turn(i))
    const out = await compactHistory(turns, 3)
    expect(out.length).toBe(6)
    expect(out[0].content).toBe('m14')
  })

  it('with a summarizer, prepends a single summary turn + keeps recents', async () => {
    const turns = Array.from({ length: 20 }, (_, i) => turn(i))
    const summarize = async (dropped: ChatTurn[]) => `resumo de ${dropped.length} msgs`
    const out = await compactHistory(turns, 3, summarize)
    expect(out[0].role).toBe('assistant')
    expect(out[0].content).toContain('[resumo da conversa anterior]')
    expect(out[0].content).toContain('resumo de 14 msgs') // 20 - 6 kept = 14 dropped
    expect(out.length).toBe(1 + 6) // summary + last 3 pairs
  })

  it('compounds an existing summary instead of nesting', async () => {
    const withSummary: ChatTurn[] = [
      { role: 'assistant', content: '[resumo da conversa anterior] velho' },
      ...Array.from({ length: 20 }, (_, i) => turn(i)),
    ]
    let receivedPrior: string | null = 'NOT_CALLED'
    const summarize = async (_d: ChatTurn[], prior: string | null) => { receivedPrior = prior; return 'novo' }
    const out = await compactHistory(withSummary, 3, summarize)
    expect(receivedPrior).toBe('velho') // prior summary passed through, not re-nested
    expect(out.filter(t => t.content.includes('[resumo')).length).toBe(1) // single summary
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
