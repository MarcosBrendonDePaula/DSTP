// Tests for the AI flow generator core — with the LLM call MOCKED (no token, no
// network). Proves prompt building, patch application, layout normalization, and the
// validation gate all work; the real model is injected in LiveAutomation.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import {
  buildGenerateMessages, buildEditMessages, applyPatch, normalizeLayout,
  generateFlowFromPrompt, editFlowWithPrompt, type GenFlow, type RunModel,
} from './generateFlow'
import type { FlowNode, FlowEdge } from '../../db'

const n = (id: string, type: string, data: any = {}): FlowNode => ({ id, type, data, position: { x: 0, y: 0 } }) as FlowNode
const e = (id: string, s: string, t: string, h?: string): FlowEdge => ({ id, source: s, target: t, sourceHandle: h }) as FlowEdge

describe('prompt building', () => {
  it('includes the node catalog and rules in the system prompt', () => {
    const { system, user } = buildGenerateMessages('heal players who join')
    expect(system).toContain('NODE CATALOG')
    expect(system).toContain('condition')
    expect(system).toContain('"true"/"false"')
    expect(user).toBe('heal players who join')
  })

  it('embeds the event_type list, ui grammar and few-shot examples', () => {
    const { system } = buildGenerateMessages('make a welcome panel')
    expect(system).toContain('EVENT CATEGORIES')
    expect(system).toContain('player_spawn')
    expect(system).toContain('UI TREE GRAMMAR')      // catalog has ui_builder
    expect(system).toContain('list of rules')         // grammar mentions the list pattern
    expect(system).toContain('EXAMPLE FLOWS')
    expect(system).toContain('"sourceHandle":"true"') // a few-shot shows a branch handle
  })

  it('edit prompt skips few-shot but keeps catalog + events; UI grammar gated on current flow', () => {
    // The full grammar BLOCK starts with this exact header (a node's note may mention
    // "UI TREE GRAMMAR" in passing — match the block, not the substring).
    const GRAMMAR_BLOCK = 'UI TREE GRAMMAR (ui_builder'
    const noUI: GenFlow = { nodes: [n('t', 'trigger', { event_type: 'x' })], edges: [] }
    const { system } = buildEditMessages('add a heal', noUI)
    expect(system).toContain('EVENT CATEGORIES')
    expect(system).not.toContain('EXAMPLE FLOWS')     // few-shot omitted on edit
    expect(system).not.toContain(GRAMMAR_BLOCK)        // no ui node in current flow

    const withUI: GenFlow = { nodes: [n('u', 'ui_builder', {})], edges: [] }
    expect(buildEditMessages('change title', withUI).system).toContain(GRAMMAR_BLOCK)
  })

  it('embeds a reference flow when provided', () => {
    const ref: GenFlow = { nodes: [n('t', 'trigger', { event_type: 'player_spawn' })], edges: [] }
    const { system } = buildGenerateMessages('do thing', ref)
    expect(system).toContain('REFERENCE FLOW')
    expect(system).toContain('player_spawn')
  })

  it('edit prompt embeds the current flow and asks for a patch', () => {
    const cur: GenFlow = { nodes: [n('t', 'trigger', { event_type: 'x' })], edges: [] }
    const { system } = buildEditMessages('add a heal', cur)
    expect(system).toContain('CURRENT FLOW')
    expect(system).toContain('PATCH')
  })
})

describe('applyPatch', () => {
  const base: GenFlow = {
    nodes: [n('t', 'trigger', { event_type: 'x' }), n('a', 'give_item', { item: 'log' })],
    edges: [e('e1', 't', 'a')],
  }

  it('adds nodes and edges', () => {
    const out = applyPatch(base, { addNodes: [n('b', 'heal')], addEdges: [e('e2', 'a', 'b')] })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'b', 't'])
    expect(out.edges.map((x) => x.id).sort()).toEqual(['e1', 'e2'])
  })

  it('removes a node and any edge touching it', () => {
    const out = applyPatch(base, { removeNodeIds: ['a'] })
    expect(out.nodes.map((x) => x.id)).toEqual(['t'])
    expect(out.edges).toHaveLength(0) // e1 touched 'a'
  })

  it('updates a node by merging data', () => {
    const out = applyPatch(base, { updateNodes: [{ id: 'a', data: { item: 'gold' } }] })
    const a = out.nodes.find((x) => x.id === 'a')!
    expect((a.data as any).item).toBe('gold')
  })

  it('does not duplicate an added node that already exists', () => {
    const out = applyPatch(base, { addNodes: [n('a', 'give_item')] })
    expect(out.nodes.filter((x) => x.id === 'a')).toHaveLength(1)
  })
})

describe('normalizeLayout', () => {
  it('lays nodes out by depth from the trigger', () => {
    const flow: GenFlow = {
      nodes: [n('t', 'trigger', { event_type: 'x' }), n('a', 'give_item'), n('b', 'heal')],
      edges: [e('e1', 't', 'a'), e('e2', 'a', 'b')],
    }
    const out = normalizeLayout(flow)
    const byId = new Map(out.nodes.map((x) => [x.id, x.position]))
    expect(byId.get('t')!.x).toBe(0)
    expect(byId.get('a')!.x).toBeGreaterThan(byId.get('t')!.x)
    expect(byId.get('b')!.x).toBeGreaterThan(byId.get('a')!.x)
  })
})

describe('generateFlowFromPrompt (mocked model)', () => {
  it('returns a validated flow on good model output', async () => {
    const runModel: RunModel = async () => ({
      nodes: [
        { id: 't', type: 'trigger', data: { event_type: 'player_spawn' } },
        { id: 'a', type: 'give_item', data: { item: 'log' } },
      ],
      edges: [{ id: 'e1', source: 't', target: 'a' }],
    })
    const res = await generateFlowFromPrompt('give a log on join', runModel)
    expect(res.ok).toBe(true)
    expect(res.flow!.nodes).toHaveLength(2)
    expect(res.validation.errors).toHaveLength(0)
  })

  it('parses node.data when the model returns it as a JSON STRING (OpenAI strict mode)', async () => {
    // OpenAI's strict structured output forces data to a string + sourceHandle "".
    const runModel: RunModel = async () => ({
      nodes: [
        { id: 't', type: 'trigger', data: '{"event_type":"player_spawn"}' },
        { id: 'c', type: 'condition', data: '{"field":"x","operator":"equals","value":"1"}' },
        { id: 'a', type: 'give_item', data: '{}' },
      ],
      edges: [
        { id: 'e1', source: 't', target: 'c', sourceHandle: '' },
        { id: 'e2', source: 'c', target: 'a', sourceHandle: 'true' },
      ],
    })
    const res = await generateFlowFromPrompt('cond flow', runModel)
    expect(res.ok).toBe(true)
    const t = res.flow!.nodes.find((n) => n.id === 't')!
    expect((t.data as any).event_type).toBe('player_spawn') // string was parsed
    const e1 = res.flow!.edges.find((e) => e.id === 'e1')!
    expect(e1.sourceHandle).toBeUndefined() // "" normalized to undefined
  })

  it('survives malformed data JSON (falls back to {})', async () => {
    const runModel: RunModel = async () => ({
      nodes: [
        { id: 't', type: 'trigger', data: '{"event_type":"x"}' },
        { id: 'a', type: 'give_item', data: 'NOT JSON' },
      ],
      edges: [{ id: 'e1', source: 't', target: 'a', sourceHandle: '' }],
    })
    const res = await generateFlowFromPrompt('x', runModel)
    const a = res.flow!.nodes.find((n) => n.id === 'a')!
    expect(a.data).toEqual({})
  })

  it('repairs an empty ui_builder tree on the second pass', async () => {
    let call = 0
    const runModel: RunModel = async () => {
      call++
      if (call === 1) {
        // first try: ui_builder with empty data (the real bug)
        return {
          nodes: [
            { id: 't', type: 'trigger', data: '{"event_type":"command"}' },
            { id: 'u', type: 'ui_builder', data: '{}' },
          ],
          edges: [{ id: 'e1', source: 't', target: 'u', sourceHandle: '' }],
        }
      }
      // repair: now a real tree
      return {
        nodes: [
          { id: 't', type: 'trigger', data: '{"event_type":"command"}' },
          { id: 'u', type: 'ui_builder', data: '{"tree":{"type":"panel","children":[{"type":"text","text":"Loja"}]}}' },
        ],
        edges: [{ id: 'e1', source: 't', target: 'u', sourceHandle: '' }],
      }
    }
    const res = await generateFlowFromPrompt('loja', runModel)
    expect(call).toBe(2)        // repair round ran
    expect(res.ok).toBe(true)
    const u = res.flow!.nodes.find((x) => x.id === 'u')!
    expect((u.data as any).tree.children.length).toBeGreaterThan(0)
  })

  it('returns the AI-chosen flow name', async () => {
    const runModel: RunModel = async () => ({
      name: 'Loja de Itens',
      nodes: [
        { id: 't', type: 'trigger', data: '{"event_type":"command"}' },
        { id: 'a', type: 'announce', data: '{"action_type":"announce","params":{"message":"oi"}}' },
      ],
      edges: [{ id: 'e1', source: 't', target: 'a', sourceHandle: '' }],
    })
    const res = await generateFlowFromPrompt('loja', runModel)
    expect(res.name).toBe('Loja de Itens')
  })

  it('reports validation errors when the model emits a bad flow', async () => {
    const runModel: RunModel = async () => ({
      nodes: [{ id: 'a', type: 'give_item', data: {} }], // no trigger
      edges: [],
    })
    const res = await generateFlowFromPrompt('broken', runModel)
    expect(res.ok).toBe(false)
    expect(res.validation.errors.map((i) => i.rule)).toContain('flow.trigger')
  })
})

describe('editFlowWithPrompt (mocked model)', () => {
  it('applies a patch and re-validates', async () => {
    const current: GenFlow = {
      nodes: [n('t', 'trigger', { event_type: 'x' }), n('a', 'give_item')],
      edges: [e('e1', 't', 'a')],
    }
    const runModel: RunModel = async () => ({
      addNodes: [{ id: 'b', type: 'heal', data: {} }],
      addEdges: [{ id: 'e2', source: 'a', target: 'b' }],
    })
    const res = await editFlowWithPrompt('add a heal after the item', current, runModel)
    expect(res.ok).toBe(true)
    expect(res.flow!.nodes.map((x) => x.id).sort()).toEqual(['a', 'b', 't'])
  })

  it('parses a patch with string data + empty handles (OpenAI strict mode)', async () => {
    const current: GenFlow = {
      nodes: [n('t', 'trigger', { event_type: 'x' }), n('a', 'give_item')],
      edges: [e('e1', 't', 'a')],
    }
    const runModel: RunModel = async () => ({
      addNodes: [{ id: 'b', type: 'heal', data: '{"amount":"50"}' }],
      removeNodeIds: [],
      updateNodes: [],
      addEdges: [{ id: 'e2', source: 'a', target: 'b', sourceHandle: '' }],
      removeEdgeIds: [],
    })
    const res = await editFlowWithPrompt('add heal', current, runModel)
    expect(res.ok).toBe(true)
    const b = res.flow!.nodes.find((x) => x.id === 'b')!
    expect((b.data as any).amount).toBe('50')
  })
})
