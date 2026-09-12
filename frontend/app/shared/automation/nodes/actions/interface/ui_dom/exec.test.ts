// ui_dom exec: HTML is parsed on the backend into tree JSON; each operation maps to
// its dom_* ui_command. Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { handler } from './exec'

function mkRc(params: Record<string, any>) {
  const commands: Array<{ type: string; data: any }> = []
  let ctx: any = {}
  const rc: any = {
    node: { id: 'n1', data: { params } },
    context: {},
    resolve: (v: any) => (typeof v === 'string' ? v.replace('{{name}}', 'Joe') : v),
    param: (key: string, def?: any) => (params[key] !== undefined ? params[key] : def),
    pushCommand: (type: string, data: any) => commands.push({ type, data }),
    setContext: (c: any) => { ctx = c },
  }
  return { rc, commands, ctx: () => ctx }
}
const cmdOf = (commands: any[]) => commands.find(c => c.type === 'ui_command')?.data

describe('ui_dom exec', () => {
  it('append: parses the (template-resolved) HTML into a node under the parent id', async () => {
    const { rc, commands, ctx } = mkRc({ userid: 'KU_1', id: 'loja', operation: 'append', node: 'lista', index: '2', html: '<button id="b1" callback="extra:b1" width="120">Oi {{name}}</button>' })
    await handler(rc)
    const d = cmdOf(commands)
    expect(d.userid).toBe('KU_1')
    expect(d.cmd).toMatchObject({ action: 'dom_append', id: 'loja', parent: 'lista', index: 2 })
    expect(d.cmd.node).toMatchObject({ type: 'button', id: 'b1', callback: 'extra:b1', width: 120, text: 'Oi Joe' })
    expect(ctx().executed).toBe(true)
  })

  it('set: props JSON → dom_set', async () => {
    const { rc, commands } = mkRc({ userid: 'KU_1', id: 'loja', operation: 'set', node: 'saldo', props: '{"text":"100"}' })
    await handler(rc)
    expect(cmdOf(commands).cmd).toMatchObject({ action: 'dom_set', id: 'loja', node: 'saldo', props: { text: '100' } })
  })

  it('toggle: empty visible flips, "false" forces hidden', async () => {
    const a = mkRc({ userid: 'KU_1', id: 'loja', operation: 'toggle', node: 'x' })
    await handler(a.rc)
    expect(cmdOf(a.commands).cmd).toMatchObject({ action: 'dom_toggle', node: 'x' })
    expect(cmdOf(a.commands).cmd.visible).toBeUndefined()
    const b = mkRc({ userid: 'KU_1', id: 'loja', operation: 'toggle', node: 'x', visible: 'false' })
    await handler(b.rc)
    expect(cmdOf(b.commands).cmd.visible).toBe(false)
  })

  it('remove → dom_remove; bad HTML → no command, error in context', async () => {
    const a = mkRc({ userid: 'KU_1', id: 'loja', operation: 'remove', node: 'b1' })
    await handler(a.rc)
    expect(cmdOf(a.commands).cmd).toMatchObject({ action: 'dom_remove', node: 'b1' })
    const b = mkRc({ userid: 'KU_1', id: 'loja', operation: 'append', node: 'lista', html: '   ' })
    await handler(b.rc)
    expect(cmdOf(b.commands)).toBeUndefined()
    expect(b.ctx().executed).toBe(false)
    expect(String(b.ctx().error)).toContain('html')
  })
})
