// ui_builder runtime `html` param (task 11): HTML produced by the flow (a script node,
// a template) is parsed on the backend into the tree the client renders, and wins over
// the static tree. Invalid HTML falls back to the static tree and reports `error`.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { handler } from './exec'

function mkRc(params: Record<string, any>) {
  const commands: Array<{ type: string; data: any }> = []
  let ctx: any = {}
  const rc: any = {
    node: { id: 'n1', data: { tree: { type: 'panel', title: 'static', children: [] }, params } },
    context: {},
    uiNodeId: () => 'ui1',
    resolve: (v: any) => (typeof v === 'string' ? v.replace('{{name}}', 'Joe') : v),
    param: (key: string, def?: any) => (params[key] !== undefined ? params[key] : def),
    resolveTree: (t: any) => t,
    pushCommand: (type: string, data: any) => commands.push({ type, data }),
    setContext: (c: any) => { ctx = c },
  }
  return { rc, commands, ctx: () => ctx }
}
const treeOf = (commands: any[]) => commands.find(c => c.type === 'ui_command')?.data?.cmd?.tree

describe('ui_builder exec — runtime html', () => {
  it('html param → parsed tree (templates resolved first), static tree ignored', async () => {
    const { rc, commands, ctx } = mkRc({ userid: 'KU_1', html: '<panel title="Oi {{name}}" width="300"><button callback="x">Ok</button></panel>' })
    await handler(rc)
    const tree = treeOf(commands)
    expect(tree).toMatchObject({ type: 'panel', title: 'Oi Joe', width: 300 })
    expect(tree.children[0]).toMatchObject({ type: 'button', callback: 'x', text: 'Ok' })
    expect(ctx().error).toBeUndefined()
  })

  it('empty html → the static tree; invalid html → static tree + error', async () => {
    const a = mkRc({ userid: 'KU_1', html: '   ' })
    await handler(a.rc)
    expect(treeOf(a.commands).title).toBe('static')
    const b = mkRc({ userid: 'KU_1', html: '<<<' })
    await handler(b.rc)
    expect(treeOf(b.commands).title).toBe('static')
    expect(typeof b.ctx().error).toBe('string')
  })
})
